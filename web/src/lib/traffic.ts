import type { TrafficCounts, TrafficSeries } from '@/api';

/** Tokens of every kind. */
export function tokensOf(counts: TrafficCounts): number {
  return counts.inputTokens + counts.outputTokens + counts.cacheReadTokens + counts.cacheWriteTokens;
}

/** What one provider passed in one step of a series. */
interface StepPart {
  provider: string;
  costUsd: number;
  requests: number;
  tokens: number;
}

/** One step of a series: when it began, its providers with traffic, and their sum. */
export interface Step {
  /** When the step began, in milliseconds. */
  start: number;
  /** The providers that passed anything, in the series' order. */
  parts: StepPart[];
  costUsd: number;
  requests: number;
  tokens: number;
}

/** A series' length of step in milliseconds. */
export function stepMs(series: TrafficSeries): number {
  return series.stepSeconds * 1000;
}

/** A series laid out step by step, oldest first. */
export function toSteps(series: TrafficSeries): Step[] {
  const first = Date.parse(series.start);

  return Array.from({ length: series.steps }, (_, index) => {
    const parts = series.providers
      .map(entry => ({
        provider: entry.provider,
        costUsd: entry.costUsd[index] ?? 0,
        requests: entry.requests[index] ?? 0,
        tokens: entry.tokens[index] ?? 0,
      }))
      .filter(part => part.requests > 0 || part.costUsd > 0 || part.tokens > 0);

    return {
      start: first + index * stepMs(series),
      parts,
      costUsd: parts.reduce((sum, part) => sum + part.costUsd, 0),
      requests: parts.reduce((sum, part) => sum + part.requests, 0),
      tokens: parts.reduce((sum, part) => sum + part.tokens, 0),
    };
  });
}

/** The leading figures a scale may top out at, times a power of ten. */
const ROUND = [1, 1.5, 2, 3, 4, 5, 6, 8, 10];

/**
 * A round figure at or above `value` to top a chart's scale, close enough
 * that the tallest bar fills most of the plot. Nothing to show still gets a
 * scale.
 */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;

  const power = 10 ** Math.floor(Math.log10(value));
  const lead = value / power;

  return (ROUND.find(round => lead <= round) ?? 10) * power;
}
