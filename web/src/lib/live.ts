import type { TrafficSeries } from '@/api';
import { niceCeiling, stepMs } from '@/lib/traffic';

/** How far back each rate reads: every point of the live chart, and the figure over it. */
const ROLLING_MS = 30_000;

/** How much of the chart's height is left above its busiest point, for the figures drawn over it. */
const HEADROOM = 0.12;

/** What the live chart can show. */
export type LiveMetric = 'output' | 'input' | 'cache' | 'cost' | 'requests';

type SeriesEntry = TrafficSeries['providers'][number];

interface MetricSpec {
  /** How much of it one provider passed in one step. */
  amount: (entry: SeriesEntry, index: number) => number;
  /** For a share: the whole the amount is a share of. A rate has none. */
  whole?: (entry: SeriesEntry, index: number) => number;
  /** For a rate: how many seconds its figure counts, 1 a second, 60 a minute, 3600 an hour. */
  per: number;
}

/** Everything sent to the provider: fresh input, and input read from or written to a cache. */
function sent(entry: SeriesEntry, index: number): number {
  return (entry.inputTokens[index] ?? 0) + (entry.cacheReadTokens[index] ?? 0) + (entry.cacheWriteTokens[index] ?? 0);
}

const METRICS: Record<LiveMetric, MetricSpec> = {
  output: { amount: (entry, index) => entry.outputTokens[index] ?? 0, per: 1 },
  input: { amount: sent, per: 1 },
  cache: { amount: (entry, index) => entry.cacheReadTokens[index] ?? 0, whole: sent, per: 1 },
  cost: { amount: (entry, index) => entry.costUsd[index] ?? 0, per: 3600 },
  requests: { amount: (entry, index) => entry.requests[index] ?? 0, per: 60 },
};

/** One provider's layer of the live chart. */
interface LiveLayer {
  provider: string;
  /** The metric at each point, read over the `ROLLING_MS` before it. */
  rates: number[];
}

/** A traffic series read for one metric, ready to draw. */
export interface LiveView {
  /** When each point is, in milliseconds: the end of each step read in full, oldest first. */
  times: number[];
  /** The providers that passed any of it, costliest first, as the series lists them. */
  layers: LiveLayer[];
  /** All providers together at each point: their rates added up, or their share as one. */
  totals: number[];
  /** True for a share from 0 to 1, which does not stack; false for a rate, which does. */
  share: boolean;
  /** The length of a step in milliseconds. */
  stepMs: number;
}

/**
 * A series read for one metric, by provider, at the end of each step read in
 * full; the last step, still filling, is left out. A rate is counted a
 * second, a minute or an hour as the metric reads; a share is of the whole it
 * is a share of. Each point reads the `ROLLING_MS` before it, or as much of it
 * as the series holds, so a burst that one reading caught reads as the wave
 * it was.
 */
export function liveView(series: TrafficSeries, metric: LiveMetric = 'output'): LiveView {
  const spec = METRICS[metric];
  const step = stepMs(series);
  const complete = Math.max(0, series.steps - 1);
  const reach = Math.max(1, Math.round(ROLLING_MS / step));
  const first = Date.parse(series.start);
  const indexes = Array.from({ length: complete }, (_, index) => index);
  const times = indexes.map(index => first + (index + 1) * step);
  const { whole } = spec;

  if (whole) {
    const entries = series.providers.filter(entry => indexes.some(index => whole(entry, index) > 0));
    const shareOf = (amounts: number[], wholes: number[]): number[] => {
      const parts = rollingSums(amounts, reach);
      const totals = rollingSums(wholes, reach);
      let last = 0;
      return parts.map((part, index) => {
        const total = totals[index] ?? 0;
        if (total > 0) last = part / total;
        return last;
      });
    };
    const layers = entries.map(entry => ({
      provider: entry.provider,
      rates: shareOf(
        indexes.map(index => spec.amount(entry, index)),
        indexes.map(index => whole(entry, index))
      ),
    }));
    const totals = shareOf(
      indexes.map(index => entries.reduce((sum, entry) => sum + spec.amount(entry, index), 0)),
      indexes.map(index => entries.reduce((sum, entry) => sum + whole(entry, index), 0))
    );
    return { times, layers, totals, share: true, stepMs: step };
  }

  const layers = series.providers
    .map(entry => ({
      provider: entry.provider,
      rates: rollingSums(
        indexes.map(index => spec.amount(entry, index)),
        reach
      ).map((sum, index) => (sum / ((Math.min(index + 1, reach) * step) / 1000)) * spec.per),
    }))
    .filter(layer => layer.rates.some(rate => rate > 0));
  const totals = times.map((_, index) => layers.reduce((sum, layer) => sum + (layer.rates[index] ?? 0), 0));

  return { times, layers, totals, share: false, stepMs: step };
}

/** Each value added to the `reach - 1` before it, or as many as there are. */
function rollingSums(values: readonly number[], reach: number): number[] {
  let sum = 0;
  return values.map((value, index) => {
    sum += value;
    if (index >= reach) sum -= values[index - reach] ?? 0;
    return sum;
  });
}

/** A point in a chart's own units. */
export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Path commands for a smooth curve through the points, after a move to the
 * first: a monotone cubic (Fritsch and Carlson), which never bulges past a
 * point, so a quiet stretch stays flat and the curve never dips below zero.
 */
export function monotoneCurve(points: readonly ChartPoint[]): string {
  const n = points.length;
  if (n < 2) return '';

  const slopes: number[] = [];
  for (let k = 0; k < n - 1; k += 1) {
    const a = points[k] as ChartPoint;
    const b = points[k + 1] as ChartPoint;
    slopes.push(b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x));
  }

  const tangents = points.map((_, k) => {
    if (k === 0) return slopes[0] ?? 0;
    if (k === n - 1) return slopes[n - 2] ?? 0;
    const before = slopes[k - 1] ?? 0;
    const after = slopes[k] ?? 0;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });

  for (let k = 0; k < n - 1; k += 1) {
    const slope = slopes[k] ?? 0;
    if (slope === 0) {
      tangents[k] = 0;
      tangents[k + 1] = 0;
      continue;
    }

    const a = (tangents[k] ?? 0) / slope;
    const b = (tangents[k + 1] ?? 0) / slope;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangents[k] = t * a * slope;
      tangents[k + 1] = t * b * slope;
    }
  }

  let path = '';
  for (let k = 0; k < n - 1; k += 1) {
    const a = points[k] as ChartPoint;
    const b = points[k + 1] as ChartPoint;
    const third = (b.x - a.x) / 3;
    path +=
      `C${round(a.x + third)},${round(a.y + (tangents[k] ?? 0) * third)} ` +
      `${round(b.x - third)},${round(b.y - (tangents[k + 1] ?? 0) * third)} ${round(b.x)},${round(b.y)}`;
  }

  return path;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Where a live chart sits: its size in its own units, the stretch of time across it, and where it ends. */
export interface LiveFrame {
  width: number;
  height: number;
  /** How much time the chart's width shows, in milliseconds. */
  span: number;
  /** The time at the right edge. */
  end: number;
}

/** A live chart, drawn: each layer's area and top line, bottom layer first, and the newest point of all. */
export interface LiveDrawing {
  layers: { provider: string; area: string; line: string }[];
  /** Each point of the topmost line: every layer added up. */
  tops: ChartPoint[];
  /** The newest point of the topmost line. */
  head: ChartPoint;
  /** What the chart's top stands for. */
  max: number;
}

/**
 * Where a share's chart starts: the tenth at or below its lowest point, so a
 * share that stays near all of it still shows its dips, and the bottom is a
 * round figure to name.
 */
export function shareFloor(shares: readonly number[]): number {
  if (shares.length === 0) return 0;
  return Math.max(0, Math.floor(Math.min(...shares) * 10 - 1e-9) / 10);
}

/**
 * The layers of a live view stacked into areas, the costliest at the
 * bottom, scaled so the busiest point sits a little below the top. With
 * nothing passed there are no layers, and the top line lies flat along the
 * bottom. A share does not stack: it is one layer for all providers, from
 * its floor (`shareFloor`) to all of it. Nothing when the view has fewer than
 * two points.
 */
export function drawLive(
  view: LiveView,
  frame: LiveFrame,
  scale?: { min: number; max: number }
): LiveDrawing | undefined {
  if (view.times.length < 2) return undefined;
  if (view.share && view.layers.length > 0) {
    return drawLive({ ...view, share: false, layers: [{ provider: '', rates: view.totals }] }, frame, {
      min: shareFloor(view.totals),
      max: 1,
    });
  }

  const min = scale?.min ?? 0;
  const max = scale?.max ?? niceCeiling(Math.max(0, ...view.totals));
  const x = (time: number): number => frame.width - ((frame.end - time) / frame.span) * frame.width;
  const y = (rate: number): number =>
    frame.height - (Math.max(0, rate - min) / (max - min)) * frame.height * (1 - HEADROOM);

  let below = view.times.map(() => 0);
  const layers = view.layers.map(layer => {
    const above = below.map((base, index) => base + (layer.rates[index] ?? 0));
    const top = view.times.map((time, index) => ({ x: x(time), y: y(above[index] ?? 0) }));
    const bottom = view.times.map((time, index) => ({ x: x(time), y: y(below[index] ?? 0) })).reverse();
    below = above;

    const first = top[0] as ChartPoint;
    const turn = bottom[0] as ChartPoint;
    const line = `M${round(first.x)},${round(first.y)}${monotoneCurve(top)}`;
    const area = `${line}L${round(turn.x)},${round(turn.y)}${monotoneCurve(bottom)}Z`;

    return { provider: layer.provider, area, line };
  });

  const tops = view.times.map((time, index) => ({ x: x(time), y: y(view.totals[index] ?? 0) }));
  return { layers, tops, head: tops.at(-1) ?? { x: frame.width, y: frame.height }, max };
}

/** The point nearest a time, by index; undefined with no points. */
export function nearestPoint(view: LiveView, time: number): number | undefined {
  const first = view.times[0];
  if (first === undefined) return undefined;

  const index = Math.round((time - first) / view.stepMs);
  return Math.min(view.times.length - 1, Math.max(0, index));
}
