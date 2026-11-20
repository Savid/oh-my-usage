import type { Account, Limit, UsageSample, UsageTrend } from '@/api';
import { primaryLimit } from './accounts';
import { forecast, verdictOf, type Forecast, type Verdict } from './forecast';
import type { Priority } from './priority';

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

  return {
    account,
    primary,
    limits,
    burn: pace && pace.basis === 'recent' ? pace.perHour : undefined,
    idle: isIdle(account, trends, now),
  };
}

/** How the list of accounts is ordered. */
export type AccountOrder = 'priority' | 'used' | 'listed';

/** The orders on offer, with what each is called. */
export const ACCOUNT_ORDERS: readonly { id: AccountOrder; name: string }[] = [
  { id: 'priority', name: 'Priority' },
  { id: 'used', name: 'Used' },
  { id: 'listed', name: 'Listed' },
];

function usedOf(view: AccountView): number {
  return view.primary?.usedFraction ?? -1;
}

/**
 * The accounts in an order. `priority`: by provider, each in the order the
 * gateway picks them (`gatewayPriority`), then those it does not pick;
 * `used`: the most used first; `listed`: as the server sent them. Ties keep
 * the server's order.
 */
export function orderAccounts(
  views: readonly AccountView[],
  order: AccountOrder,
  priorities: ReadonlyMap<string, Priority>
): AccountView[] {
  const sorted = [...views];
  if (order === 'used') return sorted.sort((a, b) => usedOf(b) - usedOf(a));
  if (order === 'listed') return sorted;

  const providers = [...new Set(views.map(view => view.account.provider))];
  // Accounts the gateway does not pick come after those it does, in the server's order.
  const place = (view: AccountView): number => priorities.get(view.account.id)?.position ?? Number.MAX_SAFE_INTEGER;
  return sorted.sort(
    (a, b) => providers.indexOf(a.account.provider) - providers.indexOf(b.account.provider) || place(a) - place(b)
  );
}

/** What the priced accounts cost a month together; undefined when none has a price. */
export function monthlyCost(accounts: readonly Account[]): number | undefined {
  const priced = accounts.flatMap(account => (account.monthlyUsd === undefined ? [] : [account.monthlyUsd]));
  return priced.length === 0 ? undefined : priced.reduce((total, price) => total + price, 0);
}

/** Weeks in a month, on average: what turns a monthly price into a week's. */
export const WEEKS_PER_MONTH = 52 / 12;
