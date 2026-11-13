import type { Limit, UsageSample } from '@/api';

const HOUR = 3_600_000;

/** A drop of at least this much between two samples is the window resetting, not noise. */
const RESET_DROP = 0.02;

/** The recent stretch a pace is read from must span at least this long to mean anything. */
const MIN_SPAN_MS = 10 * 60_000;

/** How fast a window is filling, and over what that was measured. */
interface Pace {
  /** Share of the window used per hour: 0.02 is two points an hour. */
  perHour: number;
  /** `recent` is read from recorded usage; `window` is the average since the window opened. */
  basis: 'recent' | 'window';
  /** How long the recent stretch was, in milliseconds. Only with `recent`. */
  overMs?: number;
}

/** Where a usage window stands and where it is heading. */
export interface Forecast {
  /** How much of the window's time has passed, 0 to 1. Undefined when its length or reset is unknown. */
  elapsed?: number;
  /** How fast it is filling. Undefined when there is nothing to read a pace from. */
  pace?: Pace;
  /** When it runs out at this pace, in milliseconds, if that is before it resets. */
  spentAt?: number;
  /** What it will have used when it resets, at this pace, if it does not run out first. */
  endsAt?: number;
}

/**
 * How far back the recent pace looks: a seventh of the window, so a week is
 * judged by its last day and five hours by their last three quarters, kept
 * between half an hour and a day.
 */
function lookbackMs(windowMs: number | undefined): number {
  if (windowMs === undefined) return 6 * HOUR;
  return Math.min(24 * HOUR, Math.max(HOUR / 2, windowMs / 7));
}

/**
 * The pace over the latest stretch of recorded usage: from the oldest sample
 * inside the lookback that belongs to the window as it now stands (none
 * before its last reset) to the newest.
 */
function recentPace(samples: readonly UsageSample[], limitId: string, from: number): Pace | undefined {
  const own = samples
    .filter(sample => sample.limitId === limitId)
    .map(sample => ({ time: Date.parse(sample.at), used: sample.usedFraction }))
    .sort((a, b) => a.time - b.time);

  const last = own.at(-1);
  if (!last) return undefined;

  let first = last;
  for (let index = own.length - 2; index >= 0; index -= 1) {
    const sample = own[index]!;
    // Usage only falls when the window resets: what came before is another window's.
    if (sample.time < from || sample.used > first.used + RESET_DROP) break;
    first = sample;
  }

  const overMs = last.time - first.time;
  if (overMs < MIN_SPAN_MS) return undefined;

  return { perHour: Math.max(0, last.used - first.used) / (overMs / HOUR), basis: 'recent', overMs };
}

/**
 * Where a usage window stands and where it is heading: how much of its time
 * has passed, how fast it is filling (lately, if usage was recorded; else on
 * average since it opened), and whether at that pace it runs out before it
 * resets.
 */
export function forecast(limit: Limit, samples: readonly UsageSample[], now: number): Forecast {
  const used = limit.usedFraction;
  const resetsAt = limit.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt);
  const windowMs = limit.windowSeconds === undefined ? undefined : limit.windowSeconds * 1000;
  const left = resetsAt === undefined ? undefined : Math.max(0, resetsAt - now);

  const out: Forecast = {};
  if (windowMs !== undefined && left !== undefined) {
    out.elapsed = Math.min(1, Math.max(0, 1 - left / windowMs));
  }

  if (used === undefined) return out;

  const opened = resetsAt !== undefined && windowMs !== undefined ? resetsAt - windowMs : undefined;
  const from = Math.max(now - lookbackMs(windowMs), opened ?? 0);
  const sinceOpened = opened === undefined ? 0 : now - opened;

  out.pace =
    recentPace(samples, limit.id, from) ??
    (sinceOpened >= MIN_SPAN_MS ? { perHour: used / (sinceOpened / HOUR), basis: 'window' } : undefined);

  // A window that is spent is not heading anywhere until it resets.
  if (out.pace === undefined || left === undefined || used >= 1) return out;

  const atReset = used + out.pace.perHour * (left / HOUR);
  if (atReset >= 1 && out.pace.perHour > 0) {
    out.spentAt = now + ((1 - used) / out.pace.perHour) * HOUR;
  } else {
    out.endsAt = atReset;
  }

  return out;
}
