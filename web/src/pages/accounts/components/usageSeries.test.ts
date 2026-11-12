import { describe, expect, it } from 'vitest';
import type { UsageSample } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { nearestIndex, sampleTimes, tableTimes, toSeries, valueAt } from './usageSeries';

const HOUR = 3_600_000;

function sample(limitId: string, hours: number, usedFraction: number, label = limitId): UsageSample {
  return { at: at(hours * HOUR), limitId, label, usedFraction };
}

describe('toSeries', () => {
  it('groups samples by limit in first-seen order and takes the newest label', () => {
    const series = toSeries([
      sample('7d', -2, 0.1, 'Week'),
      sample('5h', -2, 0.5),
      sample('7d', -1, 0.2, 'Claude 7 Day'),
    ]);

    expect(series.map(entry => [entry.limitId, entry.label, entry.points.length])).toEqual([
      ['7d', 'Claude 7 Day', 2],
      ['5h', '5h', 1],
    ]);
    expect(series[0]?.points[1]).toEqual({ time: NOW_MS - HOUR, usedFraction: 0.2 });
  });
});

describe('sampleTimes', () => {
  it('lists each moment once, ascending', () => {
    const series = toSeries([sample('7d', -2, 0.1), sample('5h', -2, 0.5), sample('5h', -3, 0.4)]);

    expect(sampleTimes(series)).toEqual([NOW_MS - 3 * HOUR, NOW_MS - 2 * HOUR]);
  });
});

describe('valueAt', () => {
  it('holds the last sample at or before a moment', () => {
    const [series] = toSeries([sample('7d', -4, 0.1), sample('7d', -2, 0.3)]);
    if (!series) throw new Error('no series');

    expect(valueAt(series, NOW_MS - 5 * HOUR)).toBeUndefined();
    expect(valueAt(series, NOW_MS - 4 * HOUR)).toBe(0.1);
    expect(valueAt(series, NOW_MS - 3 * HOUR)).toBe(0.1);
    expect(valueAt(series, NOW_MS)).toBe(0.3);
  });
});

describe('nearestIndex', () => {
  it('finds the closest moment', () => {
    const times = [0, 10, 20, 100];

    expect(nearestIndex(times, -5)).toBe(0);
    expect(nearestIndex(times, 14)).toBe(1);
    expect(nearestIndex(times, 16)).toBe(2);
    expect(nearestIndex(times, 1000)).toBe(3);
  });
});

describe('tableTimes', () => {
  it('keeps a short list whole', () => {
    expect(tableTimes([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('thins a long list evenly and keeps both ends', () => {
    const times = Array.from({ length: 1000 }, (_, index) => index);
    const rows = tableTimes(times);

    expect(rows).toHaveLength(60);
    expect(rows[0]).toBe(0);
    expect(rows.at(-1)).toBe(999);
    expect(new Set(rows).size).toBe(60);
  });
});
