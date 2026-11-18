import { describe, expect, it } from 'vitest';
import type { TrafficSeries } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { drawLive, liveView, monotoneCurve, nearestPoint, shareFloor } from './live';

function provider(name: string, outputTokens: number[]): TrafficSeries['providers'][number] {
  const none = outputTokens.map(() => 0);
  return {
    provider: name,
    requests: none,
    inputTokens: none,
    outputTokens,
    cacheReadTokens: none,
    cacheWriteTokens: none,
    costUsd: none,
  };
}

/** Five-second steps, the last still filling. */
const series: TrafficSeries = {
  start: at(-40_000),
  stepSeconds: 5,
  steps: 9,
  providers: [
    provider('anthropic', [500, 500, 500, 500, 500, 500, 2600, 0, 999]),
    provider('openai-codex', [0, 100, 0, 0, 0, 0, 0, 0, 0]),
    // Input only: it generated nothing, so it draws no layer.
    { ...provider('opencode-go', [0, 0, 0, 0, 0, 0, 0, 0, 0]), inputTokens: [9, 0, 0, 0, 0, 0, 0, 0, 0] },
  ],
};

describe('liveView', () => {
  it('reads each step read in full as a rate over the thirty seconds before it', () => {
    const view = liveView(series);

    // The step still filling is left out.
    expect(view.times).toHaveLength(8);
    expect(view.times[0]).toBe(NOW_MS - 35_000);
    expect(view.times.at(-1)).toBe(NOW_MS);
    expect(view.layers.map(layer => layer.provider)).toEqual(['anthropic', 'openai-codex']);

    const claude = view.layers[0]?.rates ?? [];
    // With less than thirty seconds behind it, a point reads what there is.
    expect(claude[0]).toBe(100);
    expect(claude[1]).toBe(100);
    // Six steps of 500: 100 a second. Then the burst of 2600 reads as a wave.
    expect(claude[5]).toBe(100);
    expect(claude[6]).toBeCloseTo((500 * 5 + 2600) / 30);
    expect(claude[7]).toBeCloseTo((500 * 4 + 2600) / 30);

    expect(view.totals[1]).toBeCloseTo(100 + 100 / 10);
  });

  it('has no points before a step is read in full', () => {
    const view = liveView({ start: at(0), stepSeconds: 5, steps: 1, providers: [provider('anthropic', [40])] });

    expect(view.times).toEqual([]);
    expect(view.layers).toEqual([]);
  });

  it('reads a series of minutes over its own step', () => {
    const view = liveView({
      start: at(-120_000),
      stepSeconds: 60,
      steps: 3,
      providers: [provider('anthropic', [600, 1200, 5])],
    });

    expect(view.layers[0]?.rates).toEqual([10, 20]);
  });
});

describe('liveView by metric', () => {
  /** Two steps read in full and one filling, of one provider. */
  const counts: TrafficSeries = {
    start: at(-10_000),
    stepSeconds: 5,
    steps: 3,
    providers: [
      {
        provider: 'anthropic',
        requests: [1, 2, 9],
        inputTokens: [10, 0, 9],
        outputTokens: [50, 100, 9],
        cacheReadTokens: [900, 1800, 9],
        cacheWriteTokens: [90, 200, 9],
        costUsd: [0.05, 0.1, 9],
      },
    ],
  };

  it('counts tokens in a second, cache reads and writes included', () => {
    const view = liveView(counts, 'input');

    expect(view.share).toBe(false);
    expect(view.totals).toEqual([200, 300]);
  });

  it('counts the cost an hour and requests a minute', () => {
    expect(liveView(counts, 'cost').totals.map(value => Math.round(value))).toEqual([36, 54]);
    expect(liveView(counts, 'requests').totals).toEqual([12, 18]);
  });

  it('reads the cache as a share of everything sent, which does not stack', () => {
    const view = liveView(counts, 'cache');

    expect(view.share).toBe(true);
    expect(view.totals).toEqual([0.9, 0.9]);
    expect(view.layers.map(layer => [layer.provider, layer.rates])).toEqual([['anthropic', [0.9, 0.9]]]);

    // One line for all providers, from the tenth below its lowest point to all of it.
    const drawing = drawLive(view, { width: 1000, height: 100, span: 10_000, end: NOW_MS });
    expect(drawing?.layers.map(layer => layer.provider)).toEqual(['']);
    expect(drawing?.max).toBe(1);
    // 90% sits on the floor of 80%..100%, an eighth of the way up its room.
    expect(drawing?.head.y).toBeCloseTo(100 - 0.5 * 88);
  });

  it('starts a share at the tenth at or below its lowest point', () => {
    expect(shareFloor([0.97, 0.93, 0.99])).toBe(0.9);
    expect(shareFloor([0.9])).toBe(0.8);
    expect(shareFloor([0.04])).toBe(0);
    expect(shareFloor([])).toBe(0);
  });

  it('holds a share through a stretch with nothing sent', () => {
    const quiet: TrafficSeries = {
      ...counts,
      steps: 9,
      providers: counts.providers.map(entry => ({
        ...entry,
        inputTokens: [10, 0, 0, 0, 0, 0, 0, 0, 0],
        cacheReadTokens: [90, 0, 0, 0, 0, 0, 0, 0, 0],
        cacheWriteTokens: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      })),
    };

    // Six steps on, the first has left the thirty seconds read; nothing was sent since.
    expect(liveView(quiet, 'cache').totals).toEqual([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
  });
});

describe('monotoneCurve', () => {
  it('runs through every point and stays flat where the values do', () => {
    const path = monotoneCurve([
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);

    expect(path).toBe('C3.33,10 6.67,10 10,10C13.33,10 16.67,3.33 20,0');
  });

  it('never bulges past a peak', () => {
    const path = monotoneCurve([
      { x: 0, y: 0 },
      { x: 10, y: 50 },
      { x: 20, y: 0 },
    ]);
    const ys = [...path.matchAll(/-?[\d.]+,(-?[\d.]+)/g)].map(match => Number(match[1]));

    expect(Math.max(...ys)).toBe(50);
    expect(Math.min(...ys)).toBe(0);
  });

  it('draws nothing for a single point', () => {
    expect(monotoneCurve([{ x: 1, y: 1 }])).toBe('');
  });
});

describe('drawLive', () => {
  const frame = { width: 1000, height: 100, span: 40_000, end: NOW_MS };

  it('stacks the layers, the costliest at the bottom, under a round top', () => {
    const drawing = drawLive(liveView(series), frame);

    expect(drawing?.layers.map(layer => layer.provider)).toEqual(['anthropic', 'openai-codex']);
    // The busiest point is 2500 + 2600 tokens over thirty seconds: 170 a second, under a top of 200.
    expect(drawing?.max).toBe(200);
    // The newest point is at the right edge.
    expect(drawing?.head.x).toBe(1000);
    expect(drawing?.layers[0]?.area).toMatch(/^M125,\d.*Z$/);
  });

  it('lays a flat line along the bottom when nothing was generated', () => {
    const view = liveView({ start: at(-15_000), stepSeconds: 5, steps: 4, providers: [] });
    const drawing = drawLive(view, frame);

    expect(drawing?.layers).toEqual([]);
    expect(drawing?.tops.map(point => point.y)).toEqual([100, 100, 100]);
    expect(drawing?.head).toEqual({ x: 1000, y: 100 });
  });

  it('draws nothing without two points', () => {
    const view = liveView({ start: at(0), stepSeconds: 5, steps: 2, providers: [provider('anthropic', [40, 0])] });

    expect(drawLive(view, frame)).toBeUndefined();
  });
});

describe('nearestPoint', () => {
  it('finds the point nearest a time, within the view', () => {
    const view = liveView(series);

    expect(nearestPoint(view, NOW_MS - 36_000)).toBe(0);
    expect(nearestPoint(view, NOW_MS - 6_000)).toBe(6);
    expect(nearestPoint(view, NOW_MS + 60_000)).toBe(7);
    expect(nearestPoint(liveView({ ...series, steps: 1 }), NOW_MS)).toBeUndefined();
  });
});
