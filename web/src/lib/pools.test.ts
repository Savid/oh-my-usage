import { describe, expect, it } from 'vitest';
import type { Account } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { headlinePools, poolLimits } from './pools';

const HOUR = 3_600_000;

function account(id: string, provider: string, limits: Account['limits']): Account {
  return { id, provider, paused: false, pausable: true, limits };
}

describe('poolLimits', () => {
  it('adds a window up over the accounts of a provider that report it', () => {
    const pools = poolLimits(
      [
        account('a', 'anthropic', [
          { id: '5h', label: 'Claude 5 Hour' },
          { id: '7d', label: 'Claude 7 Day', usedFraction: 0.75, resetsAt: at(20 * HOUR) },
        ]),
        account('b', 'anthropic', [
          { id: '5h', label: 'Claude 5 Hour', usedFraction: 0.5, resetsAt: at(4 * HOUR) },
          { id: '7d', label: 'Claude 7 Day', usedFraction: 0.25, resetsAt: at(32 * HOUR) },
        ]),
        account('c', 'openai-codex', [{ id: '7d', label: '7 days', usedFraction: 0.9 }]),
      ],
      NOW_MS
    );

    expect(pools.map(pool => [pool.provider, pool.limitId, pool.label, pool.seats])).toEqual([
      ['anthropic', '7d', '7 Day', 2],
      ['anthropic', '5h', '5 Hour', 1],
      ['openai-codex', '7d', '7 days', 1],
    ]);

    const [week, fiveHour, codex] = pools;
    // A quarter of one seat and three quarters of the other: one seat's worth, half of the two.
    expect(week?.left).toBeCloseTo(1);
    expect(week?.leftFraction).toBeCloseTo(0.5);
    expect(week?.severity).toBe('normal');
    expect(week?.nextReset).toBe(at(20 * HOUR));
    expect(week?.staggered).toBe(true);

    // The seat that does not report its five-hour window is not counted in it.
    expect(fiveHour?.leftFraction).toBeCloseTo(0.5);
    expect(fiveHour?.staggered).toBe(false);

    expect(codex?.leftFraction).toBeCloseTo(0.1);
    expect(codex?.severity).toBe('warn');
    expect(codex?.nextReset).toBeUndefined();
  });

  it('never counts overage as less than nothing, and ignores resets that have passed', () => {
    const [pool] = poolLimits(
      [
        account('a', 'x', [{ id: 'w', label: 'Week', usedFraction: 1.6, resetsAt: at(-HOUR) }]),
        account('b', 'x', [{ id: 'w', label: 'Week', usedFraction: 1, resetsAt: at(-2 * HOUR) }]),
      ],
      NOW_MS
    );

    expect(pool?.left).toBe(0);
    expect(pool?.severity).toBe('danger');
    expect(pool?.nextReset).toBeUndefined();
  });

  it('has nothing to add up without reported usage', () => {
    expect(poolLimits([account('a', 'openrouter', [])], NOW_MS)).toEqual([]);
    expect(poolLimits([], NOW_MS)).toEqual([]);
  });
});

describe('headlinePools', () => {
  it('keeps one window per provider: the one that resets last', () => {
    const pools = poolLimits(
      [
        account('a', 'anthropic', [
          { id: '5h', label: 'Claude 5 Hour', usedFraction: 0.5, resetsAt: at(4 * HOUR) },
          { id: '7d', label: 'Claude 7 Day', usedFraction: 0.75, resetsAt: at(20 * HOUR) },
          { id: '7d:fable', label: 'Claude 7 Day (Fable)', usedFraction: 0.1, resetsAt: at(20 * HOUR) },
        ]),
        account('c', 'opencode-go', [
          { id: 'weekly', label: 'Weekly limit', usedFraction: 0, resetsAt: at(72 * HOUR) },
          { id: 'monthly', label: 'Monthly limit', usedFraction: 0.27, resetsAt: at(264 * HOUR) },
        ]),
        account('d', 'x', [{ id: 'w', label: 'Week', usedFraction: 0.5 }]),
      ],
      NOW_MS
    );

    expect(headlinePools(pools).map(pool => [pool.provider, pool.limitId])).toEqual([
      ['anthropic', '7d'],
      ['opencode-go', 'monthly'],
      ['x', 'w'],
    ]);
    expect(headlinePools([])).toEqual([]);
  });
});
