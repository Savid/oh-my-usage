import { describe, expect, it } from 'vitest';
import type { TrafficSeries } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { niceCeiling, stepMs, tokensOf, toSteps } from './traffic';

const series: TrafficSeries = {
  start: at(-2 * 60_000),
  stepSeconds: 60,
  steps: 3,
  providers: [
    { provider: 'anthropic', requests: [4, 0, 2], tokens: [4000, 0, 900], costUsd: [1.5, 0, 0.25] },
    { provider: 'openai-codex', requests: [1, 0, 0], tokens: [300, 0, 0], costUsd: [0.5, 0, 0] },
  ],
};

describe('tokensOf', () => {
  it('adds up every kind of token', () => {
    expect(
      tokensOf({
        requests: 9,
        inputTokens: 1,
        outputTokens: 20,
        cacheReadTokens: 300,
        cacheWriteTokens: 4000,
        costUsd: 5,
      })
    ).toBe(4321);
  });
});

describe('toSteps', () => {
  it('lays a series out step by step, with only the providers that passed anything', () => {
    const steps = toSteps(series);

    expect(stepMs(series)).toBe(60_000);
    expect(steps.map(step => step.start)).toEqual([NOW_MS - 120_000, NOW_MS - 60_000, NOW_MS]);
    expect(steps[0]).toMatchObject({ costUsd: 2, requests: 5, tokens: 4300 });
    expect(steps[0]!.parts.map(part => part.provider)).toEqual(['anthropic', 'openai-codex']);
    expect(steps[1]).toMatchObject({ costUsd: 0, requests: 0, tokens: 0, parts: [] });
    expect(steps[2]!.parts).toEqual([{ provider: 'anthropic', costUsd: 0.25, requests: 2, tokens: 900 }]);
  });

  it('reads a provider with too few values as quiet', () => {
    const short: TrafficSeries = {
      ...series,
      providers: [{ provider: 'anthropic', requests: [1], tokens: [1], costUsd: [1] }],
    };

    expect(toSteps(short).map(step => step.parts.length)).toEqual([1, 0, 0]);
  });
});

describe('niceCeiling', () => {
  it('rounds up to a figure a scale can end on', () => {
    expect(niceCeiling(0.07)).toBeCloseTo(0.08);
    expect(niceCeiling(1)).toBe(1);
    expect(niceCeiling(1.2)).toBe(1.5);
    expect(niceCeiling(2.4)).toBe(3);
    expect(niceCeiling(6.4)).toBe(8);
    expect(niceCeiling(87)).toBe(100);
    expect(niceCeiling(612)).toBe(800);
  });

  it('gives nothing a scale all the same', () => {
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(-3)).toBe(1);
  });
});
