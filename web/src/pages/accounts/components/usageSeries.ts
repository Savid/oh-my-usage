import type { UsageSample } from '@/api';

/** A chart draws this many series; more would need colours that cannot be told apart. */
export const MAX_SERIES = 3;

/** How many rows the table view shows at most. */
const MAX_ROWS = 60;

interface SeriesPoint {
  /** Milliseconds since the epoch. */
  time: number;
  /** The share of the limit still unused, from 0 to 1. */
  left: number;
}

/** One limit's samples over time. */
export interface Series {
  limitId: string;
  label: string;
  points: SeriesPoint[];
}

/** Samples grouped into one series per limit, in the order the limits first appear. */
export function toSeries(samples: readonly UsageSample[]): Series[] {
  const series: Series[] = [];
  for (const sample of samples) {
    let entry = series.find(candidate => candidate.limitId === sample.limitId);
    if (!entry) {
      entry = { limitId: sample.limitId, label: sample.label, points: [] };
      series.push(entry);
    }
    // The newest sample names the series, should a provider rename a limit.
    entry.label = sample.label;
    entry.points.push({ time: Date.parse(sample.at), left: Math.min(1, Math.max(0, 1 - sample.usedFraction)) });
  }
  return series;
}

/** Every moment any of the series has a sample, ascending. */
export function sampleTimes(series: readonly Series[]): number[] {
  const times = new Set<number>();
  for (const entry of series) for (const point of entry.points) times.add(point.time);
  return [...times].sort((a, b) => a - b);
}

/** What a series had left at a moment: its last sample at or before it, as usage holds between reports. */
export function valueAt(series: Series, time: number): number | undefined {
  let value: number | undefined;
  for (const point of series.points) {
    if (point.time > time) break;
    value = point.left;
  }
  return value;
}

/** The index of the moment nearest to `time`. `times` is ascending and not empty. */
export function nearestIndex(times: readonly number[], time: number): number {
  let best = 0;
  for (let index = 1; index < times.length; index += 1) {
    if (Math.abs(times[index]! - time) < Math.abs(times[best]! - time)) best = index;
  }
  return best;
}

/** The moments the table view lists: evenly thinned to at most MAX_ROWS, always ending on the latest. */
export function tableTimes(times: readonly number[]): number[] {
  if (times.length <= MAX_ROWS) return [...times];

  const rows: number[] = [];
  const step = (times.length - 1) / (MAX_ROWS - 1);
  for (let row = 0; row < MAX_ROWS; row += 1) rows.push(times[Math.round(row * step)]!);
  return rows;
}
