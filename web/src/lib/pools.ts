import type { Account } from '@/api';
import { budgetWindow, severityOf, shortLimitLabel, type LimitSeverity } from './accounts';

/** One usage window added up over every account of a provider that reports it. */
export interface Pool {
  provider: string;
  limitId: string;
  /** The window's short name, as the cells show it. */
  label: string;
  /** How long the window lasts, in seconds, when the provider said. */
  windowSeconds?: number;
  /** How many accounts report the window. */
  seats: number;
  /** How much is used, in accounts' worth: from 0 to `seats`. An account over its limit counts as one. */
  used: number;
  /** `used` as a share of `seats`, from 0 to 1. */
  usedFraction: number;
  severity: LimitSeverity;
  /** The first of the accounts' resets still to come; nothing when none gave a time. */
  nextReset?: string;
  /** True when the accounts reset at different times, so `nextReset` is only the first. */
  staggered: boolean;
}

/**
 * One pool per provider, for the top of the page: the budget its accounts
 * live on (`budgetWindow`), by window length and then by next reset.
 * Providers keep the order they first appear in.
 */
export function headlinePools(pools: readonly Pool[]): Pool[] {
  const providers = [...new Set(pools.map(pool => pool.provider))];
  return providers.flatMap(provider => {
    const headline = budgetWindow(
      pools.filter(pool => pool.provider === provider),
      pool => pool.windowSeconds,
      pool => (pool.nextReset ? Date.parse(pool.nextReset) : undefined)
    );
    return headline ? [headline] : [];
  });
}

/**
 * Every usage window added up: for each provider and usage window, how much
 * is used across all its accounts and when the next reset comes. Pools keep
 * the order their providers and windows first appear in. A paused account
 * still counts: omp falls back to it when the others run out.
 */
export function poolLimits(accounts: readonly Account[], now: number): Pool[] {
  const pools: Pool[] = [];
  const resets = new Map<Pool, Set<number>>();

  for (const account of accounts) {
    for (const limit of account.limits) {
      if (limit.usedFraction === undefined) continue;
      const used = Math.min(1, Math.max(0, limit.usedFraction));

      let pool = pools.find(candidate => candidate.provider === account.provider && candidate.limitId === limit.id);
      if (!pool) {
        pool = {
          provider: account.provider,
          limitId: limit.id,
          label: shortLimitLabel(limit),
          windowSeconds: limit.windowSeconds,
          seats: 0,
          used: 0,
          usedFraction: 0,
          severity: 'normal',
          staggered: false,
        };
        pools.push(pool);
        resets.set(pool, new Set());
      }

      pool.seats += 1;
      pool.used += used;

      const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN;
      if (resetsAt > now) resets.get(pool)?.add(resetsAt);
    }
  }

  for (const pool of pools) {
    pool.usedFraction = pool.used / pool.seats;
    pool.severity = severityOf(pool.usedFraction);

    const times = [...(resets.get(pool) ?? [])].sort((a, b) => a - b);
    if (times[0] !== undefined) pool.nextReset = new Date(times[0]).toISOString();
    pool.staggered = times.length > 1;
  }

  return pools;
}
