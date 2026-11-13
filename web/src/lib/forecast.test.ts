import { describe, expect, it } from 'vitest';
import type { Limit, UsageSample } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { forecast } from './forecast';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const week: Limit = {
  id: 'anthropic:7d',
  label: 'Claude 7 Day',
  usedFraction: 0.5,
  resetsAt: at(2 * DAY),
  windowSeconds: 7 * 24 * 3600,
};

function sample(hours: number, usedFraction: number, limitId = week.id): UsageSample {
  return { at: at(hours * HOUR), limitId, label: 'Claude 7 Day', usedFraction };
}

describe('forecast', () => {
  it('says how much of the window has passed', () => {
    expect(forecast(week, [], NOW_MS).elapsed).toBeCloseTo(5 / 7);
    expect(forecast({ ...week, windowSeconds: undefined }, [], NOW_MS).elapsed).toBeUndefined();
    expect(forecast({ ...week, resetsAt: undefined }, [], NOW_MS).elapsed).toBeUndefined();
    // A reset that is overdue is a window that is over.
    expect(forecast({ ...week, resetsAt: at(-HOUR) }, [], NOW_MS).elapsed).toBe(1);
  });

  it('reads the pace from the last day of recorded usage and sees the window out', () => {
    // Twelve points in the last twelve hours: one an hour, 48 more by the reset.
    const got = forecast(week, [sample(-30, 0.3), sample(-12, 0.38), sample(-6, 0.44), sample(0, 0.5)], NOW_MS);

    expect(got.pace).toEqual({ perHour: 0.01, basis: 'recent', overMs: 12 * HOUR });
    expect(got.endsAt).toBeCloseTo(0.98);
    expect(got.spentAt).toBeUndefined();
  });

  it('says when the window runs out before it resets', () => {
    const got = forecast(week, [sample(-10, 0.3), sample(0, 0.5)], NOW_MS);

    // Two points an hour with half left: spent in 25 hours, 23 before the reset.
    expect(got.pace?.perHour).toBeCloseTo(0.02);
    expect(got.spentAt).toBeCloseTo(NOW_MS + 25 * HOUR);
    expect(got.endsAt).toBeUndefined();
  });

  it('does not read a pace across a reset', () => {
    // 90% an hour and a half ago, then the window reset: only what follows counts.
    const fiveHour: Limit = { ...week, id: '5h', usedFraction: 0.2, resetsAt: at(4 * HOUR), windowSeconds: 5 * 3600 };
    const samples = [sample(-1.5, 0.9, '5h'), sample(-0.5, 0.05, '5h'), sample(0, 0.2, '5h')];

    const got = forecast(fiveHour, samples, NOW_MS);

    expect(got.pace).toMatchObject({ basis: 'recent', overMs: HOUR / 2 });
    expect(got.pace?.perHour).toBeCloseTo(0.3);
    // 0.2 + 0.3 × 4 h runs past the limit: spent in 2 h 40 min.
    expect(got.spentAt).toBeCloseTo(NOW_MS + (0.8 / 0.3) * HOUR);
  });

  it('ignores other limits and usage older than the stretch it looks back over', () => {
    const fiveHour: Limit = { ...week, id: '5h', usedFraction: 0.1, resetsAt: at(4 * HOUR), windowSeconds: 5 * 3600 };

    // This limit's only sample is three hours old: older than the window, let alone the lookback.
    const got = forecast(fiveHour, [sample(-3, 0.05, '5h'), sample(0, 0.5), sample(-1, 0.2)], NOW_MS);

    // So the pace is the average since the window opened an hour ago.
    expect(got.pace?.basis).toBe('window');
    expect(got.pace?.perHour).toBeCloseTo(0.1);
    expect(got.endsAt).toBeCloseTo(0.5);
  });

  it('falls back to the average since the window opened when no usage is recorded', () => {
    const got = forecast(week, [], NOW_MS);

    // Half used in five days: 0.1 a day, so 70% by the reset.
    expect(got.pace?.basis).toBe('window');
    expect(got.pace?.perHour).toBeCloseTo(0.5 / 120);
    expect(got.endsAt).toBeCloseTo(0.7);
  });

  it('has no pace without history or a window length, and none for a stretch too short to mean anything', () => {
    expect(forecast({ ...week, windowSeconds: undefined }, [], NOW_MS)).toEqual({});
    expect(forecast({ ...week, windowSeconds: undefined }, [sample(-0.1, 0.49), sample(0, 0.5)], NOW_MS)).toEqual({});
  });

  it('holds level when nothing was used lately', () => {
    const got = forecast(week, [sample(-8, 0.5), sample(0, 0.5)], NOW_MS);

    expect(got.pace?.perHour).toBe(0);
    expect(got.endsAt).toBe(0.5);
  });

  it('makes no projection for a window that is spent or reports no amount', () => {
    const spent = forecast({ ...week, usedFraction: 1.2 }, [sample(-10, 0.9), sample(0, 1.2)], NOW_MS);
    expect(spent.pace?.perHour).toBeCloseTo(0.03);
    expect(spent.spentAt).toBeUndefined();
    expect(spent.endsAt).toBeUndefined();

    const bare = forecast({ ...week, usedFraction: undefined }, [sample(0, 0.5)], NOW_MS);
    expect(bare).toEqual({ elapsed: expect.closeTo(5 / 7) as number });
  });
});
