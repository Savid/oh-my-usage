import type { Account } from '@/api';
import { leftFraction, severityOf, shortLimitLabel, type LimitSeverity } from './accounts';

/** One usage window added up over every account of a provider that reports it. */
export interface Pool {
  provider: string;
  limitId: string;
  /** The window's short name, as the cells show it. */
  label: string;
  /** How many accounts report the window. */
  seats: number;
  /** How much is left, in accounts' worth: from 0 to `seats`. */
  left: number;
  /** `left` as a share of `seats`, from 0 to 1. */
  leftFraction: number;
  severity: LimitSeverity;
  /** The first of the accounts' resets still to come; nothing when none gave a time. */
  nextReset?: string;
  /** True when the accounts reset at different times, so `nextReset` is only the first. */
  staggered: boolean;
}

/**
 * One pool per provider, for the top of the page: the window whose next reset
 * is furthest away, which is the budget the provider's accounts live on. Ties
 * go to the first listed.
 */
export function headlinePools(pools: readonly Pool[]): Pool[] {
  const headlines: Pool[] = [];
  for (const pool of pools) {
    const index = headlines.findIndex(candidate => candidate.provider === pool.provider);
    const current = headlines[index];
    if (!current) headlines.push(pool);
    else if (resetTime(pool) > resetTime(current)) headlines[index] = pool;
  }
  return headlines;
}

function resetTime(pool: Pool): number {
  return pool.nextReset ? Date.parse(pool.nextReset) : -Infinity;
}

/**
 * Every usage window added up: for each provider and usage window, how much
 * is left across all its accounts and when the next reset comes. Pools keep
 * the order their providers and windows first appear in. A paused account
 * still counts: omp falls back to it when the others run out.
 */
export function poolLimits(accounts: readonly Account[], now: number): Pool[] {
  const pools: Pool[] = [];
  const resets = new Map<Pool, Set<number>>();

  for (const account of accounts) {
    for (const limit of account.limits) {
      const left = leftFraction(limit);
      if (left === undefined) continue;

      let pool = pools.find(candidate => candidate.provider === account.provider && candidate.limitId === limit.id);
      if (!pool) {
        pool = {
          provider: account.provider,
          limitId: limit.id,
          label: shortLimitLabel(limit),
          seats: 0,
          left: 0,
          leftFraction: 0,
          severity: 'normal',
          staggered: false,
        };
        pools.push(pool);
        resets.set(pool, new Set());
      }

      pool.seats += 1;
      pool.left += left;

      const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN;
      if (resetsAt > now) resets.get(pool)?.add(resetsAt);
    }
  }

  for (const pool of pools) {
    pool.leftFraction = pool.left / pool.seats;
    pool.severity = severityOf(pool.leftFraction);

    const times = [...(resets.get(pool) ?? [])].sort((a, b) => a - b);
    if (times[0] !== undefined) pool.nextReset = new Date(times[0]).toISOString();
    pool.staggered = times.length > 1;
  }

  return pools;
}
