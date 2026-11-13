import type { TrafficCounts, TrafficSeries } from '@/api';

/** Tokens of every kind. */
export function tokensOf(counts: TrafficCounts): number {
  return counts.inputTokens + counts.outputTokens + counts.cacheReadTokens + counts.cacheWriteTokens;
}

/** Tokens by kind: input the provider read afresh, output, and input read from or written to a cache. */
export interface TokenKinds {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** The kinds in the order they are listed, with what each is called. */
export const TOKEN_KINDS: readonly { key: keyof TokenKinds; name: string }[] = [
  { key: 'inputTokens', name: 'Input' },
  { key: 'outputTokens', name: 'Output' },
  { key: 'cacheReadTokens', name: 'Cache read' },
  { key: 'cacheWriteTokens', name: 'Cache write' },
];

/**
 * The share of everything sent to the provider that it read from a cache.
 * Undefined when nothing was sent.
 */
export function cacheShare(counts: TokenKinds): number | undefined {
  const sent = counts.inputTokens + counts.cacheReadTokens + counts.cacheWriteTokens;
  return sent > 0 ? counts.cacheReadTokens / sent : undefined;
}

/** What one provider passed in one step of a series. */
interface StepPart {
  provider: string;
  costUsd: number;
  requests: number;
  tokens: number;
}

/** One step of a series: when it began, its providers with traffic, and their sum. */
export interface Step extends TokenKinds {
  /** When the step began, in milliseconds. */
  start: number;
  /** The providers that passed anything, in the series' order. */
  parts: StepPart[];
  costUsd: number;
  requests: number;
  /** Tokens of every kind. */
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
    const kinds: TokenKinds = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const parts: StepPart[] = [];

    for (const entry of series.providers) {
      let tokens = 0;
      for (const { key } of TOKEN_KINDS) {
        const value = entry[key][index] ?? 0;
        kinds[key] += value;
        tokens += value;
      }

      const part = {
        provider: entry.provider,
        costUsd: entry.costUsd[index] ?? 0,
        requests: entry.requests[index] ?? 0,
        tokens,
      };
      if (part.requests > 0 || part.costUsd > 0 || part.tokens > 0) parts.push(part);
    }

    return {
      start: first + index * stepMs(series),
      parts,
      ...kinds,
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
