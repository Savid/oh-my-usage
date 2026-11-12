import { describe, expect, it } from 'vitest';
import { formatAge, formatDateTime, formatPercent, formatUntil } from './format';

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
