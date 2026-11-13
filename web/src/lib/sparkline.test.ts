import { describe, expect, it } from 'vitest';
import { sparkPaths } from './sparkline';

describe('sparkPaths', () => {
  it('maps time across and the share upward, with headroom at the top', () => {
    const paths = sparkPaths(
      [
        { time: 0, value: 0 },
        { time: 50, value: 0.5 },
        { time: 100, value: 1 },
      ],
      0,
      100,
      200,
      21
    );

    expect(paths?.line).toBe('M0.00 21.00 L100.00 11.00 L200.00 1.00');
    expect(paths?.area).toBe('M0.00 21.00 L100.00 11.00 L200.00 1.00 L200.00 21 L0.00 21 Z');
  });

  it('starts where the data starts and stops overage at the top', () => {
    const paths = sparkPaths(
      [
        { time: 50, value: 1.4 },
        { time: 100, value: -1 },
      ],
      0,
      100,
      100,
      11
    );

    expect(paths?.line).toBe('M50.00 1.00 L100.00 11.00');
  });

  it('draws nothing without two points or a span', () => {
    expect(sparkPaths([{ time: 0, value: 0.5 }], 0, 100, 100, 10)).toBeUndefined();
    expect(sparkPaths([], 0, 100, 100, 10)).toBeUndefined();
    expect(
      sparkPaths(
        [
          { time: 0, value: 0 },
          { time: 1, value: 1 },
        ],
        5,
        5,
        100,
        10
      )
    ).toBeUndefined();
  });
});
