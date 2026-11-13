import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatClock,
  formatCount,
  formatDateTime,
  formatDay,
  formatPercent,
  formatShare,
  formatShort,
  formatUntil,
  formatUsd,
} from './format';

const now = Date.parse('2026-09-26T12:00:00Z');

describe('formatAge', () => {
  it('scales from tenths of a second to days', () => {
    expect(formatAge('2026-09-26T11:59:59.700Z', now)).toBe('0.3 s');
    expect(formatAge('2026-09-26T11:59:48Z', now)).toBe('12 s');
    expect(formatAge('2026-09-26T11:56:00Z', now)).toBe('4 min');
    expect(formatAge('2026-09-26T09:00:00Z', now)).toBe('3 h');
    expect(formatAge('2026-09-25T00:00:00Z', now)).toBe('36 h');
    expect(formatAge('2026-09-21T12:00:00Z', now)).toBe('5 d');
  });

  it('never goes negative', () => {
    expect(formatAge('2026-09-26T12:00:05Z', now)).toBe('0.0 s');
  });
});

describe('formatUntil', () => {
  it('counts down to a later time', () => {
    expect(formatUntil('2026-09-26T12:45:00Z', now)).toBe('45 min');
    expect(formatUntil('2026-09-27T09:00:00Z', now)).toBe('21 h');
    expect(formatUntil('2026-10-24T12:00:00Z', now)).toBe('28 d');
  });

  it('stops at zero once the time has passed', () => {
    expect(formatUntil('2026-09-26T11:00:00Z', now)).toBe('0.0 s');
  });
});

describe('formatShort', () => {
  it('uses one letter per unit and never goes negative', () => {
    expect(formatShort(45_000)).toBe('45s');
    expect(formatShort(12 * 60_000)).toBe('12m');
    expect(formatShort(4 * 3_600_000)).toBe('4h');
    expect(formatShort(23.4 * 3_600_000)).toBe('23h');
    expect(formatShort(32 * 3_600_000)).toBe('1d 8h');
    expect(formatShort(5 * 86_400_000)).toBe('5d');
    expect(formatShort(-1000)).toBe('0s');
  });
});

describe('formatPercent', () => {
  it('rounds to a whole percent and keeps overage', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.756)).toBe('76%');
    expect(formatPercent(1.2)).toBe('120%');
  });
});

describe('formatDateTime', () => {
  it('names the day and the time of day', () => {
    // The hour depends on the viewer's zone; the shape does not.
    expect(formatDateTime(now)).toMatch(/^2[67] Sept?, \d{2}:\d{2}$/);
  });
});

describe('formatCount', () => {
  it('writes a count in full up to four digits and shortens it beyond', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1834)).toBe('1,834');
    expect(formatCount(15_908)).toBe('15.9K');
    expect(formatCount(336_912_058)).toBe('337M');
    expect(formatCount(1_963_701_347)).toBe('1.96B');
  });
});

describe('formatUsd', () => {
  it('is as precise as the size calls for', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(2.1)).toBe('$2.10');
    expect(formatUsd(248.85)).toBe('$249');
    expect(formatUsd(1068.1)).toBe('$1,068');
    expect(formatUsd(12_400)).toBe('$12.4K');
  });
});

describe('formatShare', () => {
  it('never rounds a real part away', () => {
    expect(formatShare(37, 100)).toBe('37%');
    expect(formatShare(0.03, 1814)).toBe('<1%');
    expect(formatShare(0, 1814)).toBe('0%');
    expect(formatShare(5, 0)).toBe('0%');
  });
});

describe('formatClock and formatDay', () => {
  it("give the time of day and the day, in the viewer's zone", () => {
    // The hour and the day depend on the viewer's zone; the shape does not.
    expect(formatClock(now)).toMatch(/^\d{2}:\d{2}$/);
    expect(formatDay(now)).toMatch(/^(Sat|Sun) 2[67]$/);
  });
});
