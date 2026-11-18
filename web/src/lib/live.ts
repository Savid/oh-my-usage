import type { TrafficSeries } from '@/api';
import { niceCeiling, stepMs } from '@/lib/traffic';

/** How far back each rate reads: every point of the live chart, and the figure over it. */
const ROLLING_MS = 30_000;

/** How much of the chart's height is left above its busiest point, for the figures drawn over it. */
const HEADROOM = 0.12;

/** One provider's layer of the live chart. */
interface LiveLayer {
  provider: string;
  /** Output tokens a second at each point, read over the `ROLLING_MS` before it. */
  rates: number[];
}

/** A traffic series read as rates, ready to draw. */
export interface LiveView {
  /** When each point is, in milliseconds: the end of each step read in full, oldest first. */
  times: number[];
  /** The providers that generated anything, costliest first, as the series lists them. */
  layers: LiveLayer[];
  /** Every provider's rate added up at each point. */
  totals: number[];
  /** The length of a step in milliseconds. */
  stepMs: number;
}

/**
 * A series read as rates of output tokens a second, by provider, at the end
 * of each step read in full; the last step, still filling, is left out. Each
 * rate is read over the `ROLLING_MS` before its point, or as much of it as the
 * series holds, so a burst that one reading caught reads as the wave it was.
 */
export function liveView(series: TrafficSeries): LiveView {
  const step = stepMs(series);
  const complete = Math.max(0, series.steps - 1);
  const reach = Math.max(1, Math.round(ROLLING_MS / step));
  const first = Date.parse(series.start);

  const times = Array.from({ length: complete }, (_, index) => first + (index + 1) * step);
  const layers = series.providers
    .map(entry => ({ provider: entry.provider, rates: rolling(entry.outputTokens.slice(0, complete), reach, step) }))
    .filter(layer => layer.rates.some(rate => rate > 0));
  const totals = times.map((_, index) => layers.reduce((sum, layer) => sum + (layer.rates[index] ?? 0), 0));

  return { times, layers, totals, stepMs: step };
}

/** Each value's rate a second over the `reach` steps up to it, or as many as there are. */
function rolling(values: readonly number[], reach: number, step: number): number[] {
  let sum = 0;
  return values.map((value, index) => {
    sum += value;
    if (index >= reach) sum -= values[index - reach] ?? 0;
    return sum / ((Math.min(index + 1, reach) * step) / 1000);
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
  /** The rate the chart's top stands for. */
  max: number;
}

/**
 * The layers of a live view stacked into areas, the costliest at the
 * bottom, scaled so the busiest point sits a little below the top. With
 * nothing generated there are no layers, and the top line lies flat along
 * the bottom. Nothing when the view has fewer than two points.
 */
export function drawLive(view: LiveView, frame: LiveFrame): LiveDrawing | undefined {
  if (view.times.length < 2) return undefined;

  const max = niceCeiling(Math.max(0, ...view.totals));
  const x = (time: number): number => frame.width - ((frame.end - time) / frame.span) * frame.width;
  const y = (rate: number): number => frame.height - (rate / max) * frame.height * (1 - HEADROOM);

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
