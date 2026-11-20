import type { Account, Limit, UsageSample, UsageTrend } from '@/api';
import { limitSeverity, primaryLimit, resetOutlook } from './accounts';
import { forecast, verdictOf, type Forecast, type Verdict } from './forecast';

const HOUR = 3_600_000;

/** An account none of whose windows rose for this long is idle. */
const IDLE_MS = 2 * HOUR;

/** A rise smaller than this is the provider rounding, not use. */
const RISE = 0.005;

/** One window of an account with where it is heading. */
interface LimitView {
  limit: Limit;
  forecast: Forecast;
  verdict: Verdict;
}

/** An account with its windows read against their clocks. */
export interface AccountView {
  account: Account;
  /** The window the account lives on; see `primaryLimit`. */
  primary?: Limit;
  /** Every window, the primary first, then as the provider lists them. */
  limits: LimitView[];
  /** How fast the primary window has been filling lately, as a share an hour. Only from recorded usage. */
  burn?: number;
  /** Whether nothing was used for `IDLE_MS`. Undefined when the record does not reach back that far. */
  idle?: boolean;
  /**
   * The longest any window would sit spent before it resets, at its pace, in
   * milliseconds: how much the account would miss.
   */
  dryFor?: number;
  /** Saved resets that expire before their window resets: spent in this one or lost (`isLapsing`). */
  resetsLapsing?: number;
}

/** One account's recorded usage, as the samples `forecast` reads. */
export function trendSamples(trends: readonly UsageTrend[], accountId: string): UsageSample[] {
  return trends
    .filter(trend => trend.accountId === accountId)
    .flatMap(trend =>
      trend.points.map(point => ({
        at: point.at,
        limitId: trend.limitId,
        label: trend.limitId,
        usedFraction: point.usedFraction,
      }))
    );
}

/**
 * Whether an account has used nothing lately: none of its windows rose in
 * the last `IDLE_MS`, counting its current level as the newest reading.
 * Undefined when no window's record reaches back that far.
 */
export function isIdle(account: Account, trends: readonly UsageTrend[], now: number): boolean | undefined {
  const cutoff = now - IDLE_MS;
  let covered = false;

  for (const trend of trends) {
    if (trend.accountId !== account.id) continue;

    const points = trend.points.map(point => ({ time: Date.parse(point.at), used: point.usedFraction }));
    const current = account.limits.find(limit => limit.id === trend.limitId)?.usedFraction;
    if (current !== undefined) points.push({ time: now, used: current });

    let previous: { time: number; used: number } | undefined;
    for (const point of points) {
      if (point.time <= cutoff) covered = true;
      else if (previous && point.used > previous.used + RISE) return false;
      previous = point;
    }
  }

  return covered ? true : undefined;
}

/** An account's windows read against their clocks, with its pace and whether it is idle. */
export function viewAccount(account: Account, trends: readonly UsageTrend[], now: number): AccountView {
  const samples = trendSamples(trends, account.id);
  const primary = primaryLimit(account.limits);
  const ordered = primary ? [primary, ...account.limits.filter(limit => limit !== primary)] : account.limits;

  const limits = ordered.map(limit => {
    const view = forecast(limit, samples, now);
    return { limit, forecast: view, verdict: verdictOf(limit.usedFraction, view) };
  });

  const main = limits[0];
  const pace = primary && main?.forecast.pace;
  const gaps = limits.flatMap(({ limit, forecast: view }) =>
    view.spentAt === undefined || limit.resetsAt === undefined ? [] : [Date.parse(limit.resetsAt) - view.spentAt]
  );

  return {
    account,
    primary,
    limits,
    burn: pace && pace.basis === 'recent' ? pace.perHour : undefined,
    idle: isIdle(account, trends, now),
    dryFor: gaps.length > 0 ? Math.max(...gaps) : undefined,
    resetsLapsing: resetOutlook(account, now).lapsing,
  };
}

/** How the list of accounts is ordered. */
export type AccountOrder = 'risk' | 'used' | 'listed';

/** The orders on offer, with what each is called. */
export const ACCOUNT_ORDERS: readonly { id: AccountOrder; name: string }[] = [
  { id: 'risk', name: 'Risk' },
  { id: 'used', name: 'Used' },
  { id: 'listed', name: 'Listed' },
];

function usedOf(view: AccountView): number {
  return view.primary?.usedFraction ?? -1;
}

/**
 * The accounts in an order. `risk`: those that would sit spent before they
 * reset, the longest first, then the most used; `used`: the most used first;
 * `listed`: as the server sent them. Paused accounts go last in `risk`, since
 * they take no traffic. Ties keep the server's order.
 */
export function orderAccounts(views: readonly AccountView[], order: AccountOrder): AccountView[] {
  const sorted = [...views];
  if (order === 'used') return sorted.sort((a, b) => usedOf(b) - usedOf(a));
  if (order === 'listed') return sorted;

  return sorted.sort((a, b) => {
    if (a.account.paused !== b.account.paused) return a.account.paused ? 1 : -1;
    const dryA = a.dryFor ?? -1;
    const dryB = b.dryFor ?? -1;
    if (dryA !== dryB) return dryB - dryA;
    return usedOf(b) - usedOf(a);
  });
}

/** The whole fleet in figures. */
export interface Fleet {
  accounts: number;
  /** Accounts whose usage rose lately. */
  burning: number;
  idle: number;
  paused: number;
  /** Accounts with a window already spent. */
  spent: number;
  /** What the priced accounts cost a month together; undefined when none is priced. */
  monthlyUsd?: number;
  /** How many accounts have a price. */
  priced: number;
  /** Saved resets that can be spent now. */
  resetsUsable: number;
  /** Saved resets to spend before their window resets, or lose. */
  resetsLapsing: number;
}

/** The fleet's figures, from its accounts' views. */
export function fleetOf(views: readonly AccountView[]): Fleet {
  const fleet: Fleet = {
    accounts: views.length,
    burning: 0,
    idle: 0,
    paused: 0,
    spent: 0,
    priced: 0,
    resetsUsable: 0,
    resetsLapsing: 0,
  };

  for (const view of views) {
    const { account } = view;
    if (account.paused) fleet.paused += 1;
    if (view.idle === true) fleet.idle += 1;
    if (view.idle === false) fleet.burning += 1;
    if (account.limits.some(limit => limitSeverity(limit) === 'danger')) fleet.spent += 1;
    fleet.resetsUsable += account.resets?.usable ?? 0;
    fleet.resetsLapsing += view.resetsLapsing ?? 0;
    if (account.monthlyUsd !== undefined) {
      fleet.priced += 1;
      fleet.monthlyUsd = (fleet.monthlyUsd ?? 0) + account.monthlyUsd;
    }
  }

  return fleet;
}

/** Weeks in a month, on average: what turns a monthly price into a week's. */
export const WEEKS_PER_MONTH = 52 / 12;
