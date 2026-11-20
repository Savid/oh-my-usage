import { describe, expect, it } from 'vitest';
import type { Account, UsageTrend } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { fleetOf, isIdle, orderAccounts, trendSamples, viewAccount, type AccountView } from './fleet';
import type { Priority } from './priority';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function account(id: string, used: number | undefined, extra: Partial<Account> = {}): Account {
  return {
    id,
    provider: 'anthropic',
    paused: false,
    pausable: true,
    blocks: [],
    limits: [
      {
        id: 'anthropic:7d',
        label: 'Claude 7 Day',
        usedFraction: used,
        resetsAt: at(3 * DAY),
        windowSeconds: 7 * 24 * 3600,
      },
    ],
    ...extra,
  };
}

/** A trend for the week window with one point an hour for the hours given, oldest first. */
function trend(accountId: string, values: readonly number[]): UsageTrend {
  return {
    accountId,
    limitId: 'anthropic:7d',
    points: values.map((usedFraction, index) => ({ at: at((index - values.length) * HOUR), usedFraction })),
  };
}

describe('trendSamples', () => {
  it("turns one account's trends into samples", () => {
    const samples = trendSamples([trend('a', [0.1, 0.2]), trend('b', [0.5])], 'a');

    expect(samples).toEqual([
      { at: at(-2 * HOUR), limitId: 'anthropic:7d', label: 'anthropic:7d', usedFraction: 0.1 },
      { at: at(-HOUR), limitId: 'anthropic:7d', label: 'anthropic:7d', usedFraction: 0.2 },
    ]);
  });
});

describe('isIdle', () => {
  it('is idle when nothing rose in the last two hours', () => {
    expect(isIdle(account('a', 0.4), [trend('a', [0.4, 0.4, 0.4])], NOW_MS)).toBe(true);
  });

  it('is busy when a window rose, its current level included', () => {
    expect(isIdle(account('a', 0.4), [trend('a', [0.3, 0.35, 0.4])], NOW_MS)).toBe(false);
    expect(isIdle(account('a', 0.45), [trend('a', [0.4, 0.4, 0.4])], NOW_MS)).toBe(false);
  });

  it('ignores a drop, which is a reset, and rounding', () => {
    expect(isIdle(account('a', 0.002), [trend('a', [0.9, 0, 0])], NOW_MS)).toBe(true);
  });

  it('does not say without a record that reaches back far enough', () => {
    expect(isIdle(account('a', 0.4), [trend('a', [0.4])], NOW_MS)).toBeUndefined();
    expect(isIdle(account('a', 0.4), [], NOW_MS)).toBeUndefined();
  });
});

describe('viewAccount', () => {
  it('puts the main window first and reads its pace', () => {
    const seat = account('a', 0.5, {
      limits: [
        { id: 'anthropic:5h', label: 'Claude 5 Hour', usedFraction: 0.1, resetsAt: at(HOUR), windowSeconds: 5 * 3600 },
        ...account('a', 0.5).limits,
      ],
    });
    const view = viewAccount(seat, [trend('a', [0.3, 0.35, 0.4, 0.45, 0.5])], NOW_MS);

    expect(view.limits.map(entry => entry.limit.id)).toEqual(['anthropic:7d', 'anthropic:5h']);
    expect(view.primary?.id).toBe('anthropic:7d');
    expect(view.burn).toBeCloseTo(0.05);
    expect(view.idle).toBe(false);
    // Five points an hour for three more days runs dry long before the reset.
    expect(view.limits[0]?.verdict).toBe('dry');
  });

  it('has no pace or verdict without usage', () => {
    const view = viewAccount(account('a', undefined), [], NOW_MS);

    expect(view.primary).toBeUndefined();
    expect(view.burn).toBeUndefined();
    expect(view.limits[0]?.verdict).toBe('unknown');
  });
});

describe('orderAccounts', () => {
  const views: AccountView[] = [
    { account: account('quiet', 0.2), primary: account('quiet', 0.2).limits[0], limits: [] },
    { account: account('busy', 0.9), primary: account('busy', 0.9).limits[0], limits: [] },
    { account: account('worst', 0.6), primary: account('worst', 0.6).limits[0], limits: [] },
    { account: account('codex', 0.1, { provider: 'openai-codex' }), limits: [] },
    { account: account('paused', 0.95, { paused: true }), primary: account('paused', 0.95).limits[0], limits: [] },
    { account: account('none', undefined), limits: [] },
  ];
  const ids = (list: AccountView[]): string[] => list.map(view => view.account.id);

  const priority = (position: number): Priority => ({ standing: 'ranked', rank: position + 1, reason: '', position });
  // The gateway's picks within each provider; 'none' is not one it picks.
  const priorities = new Map([
    ['worst', priority(0)],
    ['quiet', priority(1)],
    ['busy', priority(2)],
    ['paused', priority(3)],
    ['codex', priority(0)],
  ]);

  it("groups by provider in the order they first appear, each in the gateway's order, unpicked last", () => {
    expect(ids(orderAccounts(views, 'priority', priorities))).toEqual([
      'worst',
      'quiet',
      'busy',
      'paused',
      'none',
      'codex',
    ]);
  });

  it('orders by the main window used, or as listed', () => {
    expect(ids(orderAccounts(views, 'used', priorities))).toEqual([
      'paused',
      'busy',
      'worst',
      'quiet',
      'codex',
      'none',
    ]);
    expect(ids(orderAccounts(views, 'listed', priorities))).toEqual([
      'quiet',
      'busy',
      'worst',
      'codex',
      'paused',
      'none',
    ]);
  });
});

describe('fleetOf', () => {
  it('counts the fleet and adds up its prices', () => {
    const spent = account('spent', 1, { monthlyUsd: 200, resets: { available: 2, usable: 1 } });
    const fleet = fleetOf([
      { account: spent, limits: [], idle: false, resetsLapsing: 1 },
      { account: account('idle', 0.1, { monthlyUsd: 50 }), limits: [], idle: true },
      { account: account('paused', 0.1, { paused: true }), limits: [] },
    ]);

    expect(fleet).toEqual({
      accounts: 3,
      burning: 1,
      idle: 1,
      paused: 1,
      spent: 1,
      monthlyUsd: 250,
      priced: 2,
      resetsUsable: 1,
      resetsLapsing: 1,
    });
  });

  it('has no price when nothing is priced', () => {
    expect(fleetOf([{ account: account('a', 0.1), limits: [] }]).monthlyUsd).toBeUndefined();
  });
});
