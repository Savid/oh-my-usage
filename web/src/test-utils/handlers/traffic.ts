import { delay, http, HttpResponse } from 'msw';
import type { Traffic, TrafficCounts, TrafficSeries } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function counts(requests: number, costUsd: number): TrafficCounts {
  return {
    requests,
    inputTokens: requests * 2,
    outputTokens: requests * 900,
    cacheReadTokens: requests * 180_000,
    cacheWriteTokens: requests * 6000,
    costUsd,
  };
}

/** A wave of traffic: one value per step, never below zero, quiet now and then. */
function wave(steps: number, peak: number, period: number, quietEvery: number): number[] {
  return Array.from({ length: steps }, (_, step) =>
    step % quietEvery === 0 ? 0 : Math.round(peak * (0.55 + 0.45 * Math.sin(step / period)) * 100) / 100
  );
}

function providerSeries(
  provider: string,
  steps: number,
  peak: number,
  period: number,
  quietEvery: number
): TrafficSeries['providers'][number] {
  const costUsd = wave(steps, peak, period, quietEvery);
  return {
    provider,
    costUsd,
    requests: costUsd.map(cost => Math.round(cost * 6)),
    inputTokens: costUsd.map(cost => Math.round(cost * 12)),
    outputTokens: costUsd.map(cost => Math.round(cost * 5500)),
    cacheReadTokens: costUsd.map(cost => Math.round(cost * 1_050_000)),
    cacheWriteTokens: costUsd.map(cost => Math.round(cost * 44_000)),
  };
}

/**
 * A provider's last ten minutes in five-second steps: a rolling swell with a
 * burst now and then, as a gateway's readings come in. The last step is the
 * one still filling, and holds little.
 */
function liveSeries(
  provider: string,
  steps: number,
  perStep: number,
  phase: number
): TrafficSeries['providers'][number] {
  const outputTokens = Array.from({ length: steps }, (_, step) => {
    if (step === steps - 1) return Math.round(perStep * 0.2);
    const swell = 0.6 + 0.4 * Math.sin((step + phase) / 9) + 0.25 * Math.sin((step + phase) / 2.3);
    const burst = (step + phase) % 13 === 0 ? 2.2 : 1;
    return Math.max(0, Math.round(perStep * swell * burst));
  });
  return {
    provider,
    outputTokens,
    requests: outputTokens.map(tokens => Math.round(tokens / 900)),
    inputTokens: outputTokens.map(tokens => Math.round(tokens / 400)),
    cacheReadTokens: outputTokens.map(tokens => tokens * 190),
    cacheWriteTokens: outputTokens.map(tokens => tokens * 8),
    costUsd: outputTokens.map(tokens => Math.round(tokens * 0.00012 * 100) / 100),
  };
}

const LIVE_STEP = 5000;

/** Where a live series of `steps` begins, its last step holding the reading eight seconds ago. */
function liveStart(steps: number): string {
  const reading = NOW_MS - 8000;
  return new Date(reading - (reading % LIVE_STEP) - (steps - 1) * LIVE_STEP).toISOString();
}

/** A busy gateway: two providers over the last hour, three over the week, measured for three days. */
export const trafficFixture: Traffic = {
  available: true,
  updatedAt: at(-8000),
  measuredSince: at(-72 * HOUR),
  windows: [
    {
      id: 'hour',
      since: at(-HOUR),
      total: counts(1834, 248.85),
      providers: [
        { provider: 'anthropic', counts: counts(1790, 247.6) },
        { provider: 'openai-codex', counts: counts(44, 1.25) },
      ],
    },
    {
      id: 'day',
      since: at(-24 * HOUR),
      total: counts(8607, 1068.1),
      providers: [
        { provider: 'anthropic', counts: counts(8501, 1063.75) },
        { provider: 'openai-codex', counts: counts(68, 4.31) },
        { provider: 'opencode-go', counts: counts(38, 0.04) },
      ],
    },
    {
      id: 'week',
      since: at(-7 * 24 * HOUR),
      total: counts(15_908, 1785.98),
      providers: [
        { provider: 'anthropic', counts: counts(15_829, 1781.34) },
        { provider: 'openai-codex', counts: counts(41, 4.6) },
        { provider: 'opencode-go', counts: counts(38, 0.04) },
      ],
    },
  ],
  live: {
    start: liveStart(120),
    stepSeconds: 5,
    steps: 120,
    providers: [liveSeries('anthropic', 120, 1100, 0), liveSeries('openai-codex', 120, 260, 40)],
  },
  minutes: {
    start: at(-59 * MINUTE),
    stepSeconds: 60,
    steps: 60,
    providers: [providerSeries('anthropic', 60, 6.4, 4, 17), providerSeries('openai-codex', 60, 0.9, 7, 5)],
  },
  hours: {
    start: at(-167 * HOUR),
    stepSeconds: 3600,
    steps: 168,
    providers: [
      providerSeries('anthropic', 168, 38, 9, 11),
      providerSeries('openai-codex', 168, 4, 5, 3),
      providerSeries('opencode-go', 168, 0.6, 13, 2),
    ],
  },
  clients: [
    {
      installId: 'install-1',
      hostname: 'gateway-host',
      app: 'gateway',
      provider: 'anthropic',
      counts: counts(15_640, 1760.2),
    },
    { installId: 'install-2', hostname: 'laptop', app: 'omp', provider: 'anthropic', counts: counts(189, 21.14) },
    {
      installId: 'install-1',
      hostname: 'gateway-host',
      app: 'gateway',
      provider: 'openai-codex',
      counts: counts(41, 4.6),
    },
    {
      installId: 'install-1',
      hostname: 'gateway-host',
      app: 'gateway',
      provider: 'opencode-go',
      counts: counts(38, 0.04),
    },
  ],
};

/** A broker with nothing passing through it yet. */
export const quietTrafficFixture: Traffic = {
  available: true,
  updatedAt: at(-8000),
  measuredSince: at(-30_000),
  windows: [
    { id: 'hour', since: at(-HOUR), total: counts(0, 0), providers: [] },
    { id: 'day', since: at(-24 * HOUR), total: counts(0, 0), providers: [] },
    { id: 'week', since: at(-7 * 24 * HOUR), total: counts(0, 0), providers: [] },
  ],
  live: { start: liveStart(120), stepSeconds: 5, steps: 120, providers: [] },
  minutes: { start: at(-59 * MINUTE), stepSeconds: 60, steps: 60, providers: [] },
  hours: { start: at(-167 * HOUR), stepSeconds: 3600, steps: 168, providers: [] },
  clients: [],
};

/** The daemon started moments ago: a few seconds live, the last hour from the record. */
export const warmingTrafficFixture: Traffic = {
  ...trafficFixture,
  live: {
    start: liveStart(4),
    stepSeconds: 5,
    steps: 4,
    providers: [liveSeries('anthropic', 4, 1100, 0)],
  },
};

/** No broker configured: nothing to show. */
const noTrafficFixture: Traffic = {
  ...quietTrafficFixture,
  available: false,
  updatedAt: undefined,
  measuredSince: undefined,
};

/** The broker stopped answering: the last traffic, and why it is old. */
export const staleTrafficFixture: Traffic = {
  ...trafficFixture,
  updatedAt: at(-12 * MINUTE),
  error: 'GET /v1/usage/clients: connection refused',
};

const TRAFFIC = '/api/v1/traffic';

/** MSW handlers for GET /api/v1/traffic. */
export const trafficHandlers = {
  ok: http.get(TRAFFIC, () => HttpResponse.json(trafficFixture)),
  quiet: http.get(TRAFFIC, () => HttpResponse.json(quietTrafficFixture)),
  warming: http.get(TRAFFIC, () => HttpResponse.json(warmingTrafficFixture)),
  unavailable: http.get(TRAFFIC, () => HttpResponse.json(noTrafficFixture)),
  stale: http.get(TRAFFIC, () => HttpResponse.json(staleTrafficFixture)),
  down: http.get(TRAFFIC, () => new HttpResponse(null, { status: 502 })),
  pending: http.get(TRAFFIC, async () => {
    await delay('infinite');
    return HttpResponse.json(trafficFixture);
  }),
};
