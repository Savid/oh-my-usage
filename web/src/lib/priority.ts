import type { Account, Limit } from '@/api';
import { primaryLimit } from './accounts';
import { formatShort } from './format';

/**
 * Where an account stands in the gateway's order for one of its provider's
 * new conversations, and why. A conversation already under way stays on its
 * account.
 */
export interface Priority {
  /** `ranked`: picked in `rank` order; `later`: held back while a sibling is free; `last`: not picked while one is. */
  standing: 'ranked' | 'later' | 'last';
  /** 1 for the account a new conversation goes to. Set when ranked. */
  rank?: number;
  /** Why it stands there, in a few words. */
  reason: string;
  /** Its place among its provider's accounts, all standings included. */
  position: number;
}

// omp's own constants (packages/ai/src/auth): the default usage reserve, the
// short-window share past which an account is passed over, and the fallback
// window lengths for a window that does not say.
const RESERVE = 0.1;
const HOT = 0.85;
const WEEK_MS = 7 * 24 * 3_600_000;
const FIVE_HOURS_MS = 5 * 3_600_000;

/** A limit kept for one model, such as Claude's Fable week: it does not gate other requests. */
function modelScoped(limit: Limit): boolean {
  return /\(.+\)/.test(limit.label);
}

/** omp's two windows for ranking: the short one (`primary`) and the long one (`secondary`). */
function windows(limits: readonly Limit[]): { short?: Limit; long?: Limit } {
  return {
    short: limits.find(limit => /:(primary|5h)$/.test(limit.id)),
    long: limits.find(limit => /:(secondary|7d)$/.test(limit.id)) ?? primaryLimit(limits),
  };
}

/** A share for ranking: unreported reads as half, as omp reads it. */
function share(limit: Limit | undefined): number {
  return limit?.usedFraction ?? 0.5;
}

/**
 * The soonest a usable saved reset that clears `limit` expires, when that is
 * before the window resets on its own. Its quota is then due by that expiry.
 */
function lapsingDeadline(account: Account, limit: Limit | undefined, now: number): number | undefined {
  if (!limit) return undefined;
  const resetsAt = limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt);
  let deadline: number | undefined;
  for (const reset of account.resets?.saved ?? []) {
    if (reset.usable === false || reset.expiresAt === undefined) continue;
    if (reset.clears.length > 0 && !reset.clears.includes(limit.id)) continue;
    const expires = Date.parse(reset.expiresAt);
    if (!(expires > now) || (resetsAt !== undefined && expires >= resetsAt)) continue;
    deadline = deadline === undefined ? expires : Math.min(deadline, expires);
  }
  return deadline;
}

/** How long is left to use a window's headroom: until it resets, or a lapsing reset's deadline. */
function timeLeft(limit: Limit | undefined, fallbackMs: number, deadline: number | undefined, now: number): number {
  const lengthMs = limit?.windowSeconds === undefined ? fallbackMs : limit.windowSeconds * 1000;
  let left = limit?.resetsAt === undefined ? lengthMs : Date.parse(limit.resetsAt) - now;
  left = Math.min(left, lengthMs);
  if (deadline !== undefined) left = Math.min(left, deadline - now);
  return Math.max(left, 60_000);
}

/** The share of a window left to use for each hour it has left: the most urgent is used first. */
function drain(limit: Limit | undefined, fallbackMs: number, deadline: number | undefined, now: number): number {
  const headroom = 1 - share(limit);
  if (headroom <= 0) return 0;
  return headroom / (timeLeft(limit, fallbackMs, deadline, now) / 3_600_000);
}

interface Ranked {
  account: Account;
  position: number;
  blocked: boolean;
  blockedUntil: number;
  inReserve: boolean;
  boost: boolean;
  hot: boolean;
  measured: boolean;
  longDrain: number;
  longUsed: number;
  shortDrain: number;
  shortUsed: number;
  reason: { standing: Priority['standing']; text: string };
}

function rank(account: Account, position: number, now: number): Ranked {
  const { short, long } = windows(account.limits);
  const gating = account.limits.filter(limit => !modelScoped(limit) && limit.usedFraction !== undefined);
  const fullest = gating.length === 0 ? undefined : Math.max(...gating.map(limit => limit.usedFraction ?? 0));
  const blockedUntil = account.blockedUntil === undefined ? undefined : Date.parse(account.blockedUntil);
  const spent = fullest !== undefined && fullest >= 1;
  const blocked = account.paused || (blockedUntil !== undefined && blockedUntil > now) || spent;
  const inReserve = fullest !== undefined && 1 - fullest <= RESERVE;
  const boost =
    account.provider === 'openai-codex' && short?.windowSeconds === FIVE_HOURS_MS / 1000 && short.usedFraction === 0;
  const hot = share(short) >= HOT;
  const deadline = lapsingDeadline(account, long, now);

  let reason: Ranked['reason'];
  if (blocked) {
    reason = { standing: 'last', text: account.paused ? 'paused' : spent ? 'spent' : 'blocked' };
  } else if (inReserve) {
    reason = { standing: 'later', text: `under ${Math.round(RESERVE * 100)}%` };
  } else if (hot) {
    reason = {
      standing: 'later',
      text: `${short?.windowSeconds === FIVE_HOURS_MS / 1000 ? '5h' : 'week'} nearly full`,
    };
  } else if (boost) {
    reason = { standing: 'ranked', text: '5h untouched' };
  } else if (deadline !== undefined) {
    reason = { standing: 'ranked', text: `reset lapses in ${formatShort(deadline - now)}` };
  } else if (long?.usedFraction !== undefined) {
    // The row already says when the window resets.
    reason = { standing: 'ranked', text: `${Math.round((1 - long.usedFraction) * 100)}% left` };
  } else {
    reason = { standing: 'ranked', text: 'no usage' };
  }

  return {
    account,
    position,
    blocked,
    blockedUntil: account.paused ? Infinity : (blockedUntil ?? Infinity),
    inReserve,
    boost,
    hot,
    measured: short?.usedFraction !== undefined || long?.usedFraction !== undefined,
    longDrain: drain(long, WEEK_MS, deadline, now),
    longUsed: share(long),
    shortDrain: drain(short, FIVE_HOURS_MS, lapsingDeadline(account, short, now), now),
    shortUsed: share(short),
    reason,
  };
}

/** omp's comparator (packages/ai/src/auth/rank.ts), step for step. */
function compare(a: Ranked, b: Ranked): number {
  if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
  if (a.blocked) return a.blockedUntil - b.blockedUntil || a.position - b.position;
  if (a.inReserve !== b.inReserve) return a.inReserve ? 1 : -1;
  if (a.boost !== b.boost) return a.boost ? -1 : 1;
  if (a.hot !== b.hot) return a.hot ? 1 : -1;
  if (a.measured !== b.measured) return a.measured ? -1 : 1;
  return (
    b.longDrain - a.longDrain ||
    a.longUsed - b.longUsed ||
    b.shortDrain - a.shortDrain ||
    a.shortUsed - b.shortUsed ||
    a.position - b.position
  );
}

/**
 * Each pickable account's place in the gateway's order, per provider: a
 * subscription login the broker holds. API keys are picked another way and
 * accounts the broker does not hold are not picked at all; neither has one.
 * Mirrors omp's ranking for a request no model's own limit applies to.
 */
export function gatewayPriority(accounts: readonly Account[], now: number): Map<string, Priority> {
  const providers = new Map<string, Ranked[]>();
  accounts.forEach((account, position) => {
    if (account.kind === 'api_key' || !account.pausable) return;
    const ranked = rank(account, position, now);
    providers.set(account.provider, [...(providers.get(account.provider) ?? []), ranked]);
  });

  const out = new Map<string, Priority>();
  for (const ranked of providers.values()) {
    let next = 1;
    ranked.sort(compare).forEach((entry, position) => {
      const { standing, text } = entry.reason;
      out.set(entry.account.id, {
        standing,
        rank: standing === 'ranked' ? next++ : undefined,
        reason: text,
        position,
      });
    });
  }
  return out;
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}
