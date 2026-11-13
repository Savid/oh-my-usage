import { http, HttpResponse } from 'msw';
import type {
  AccountList,
  Limit,
  Traffic,
  TrafficCounts,
  TrafficSeries,
  TrafficWindow,
  UsageTrend,
  UsageTrendList,
} from '@/api';
import { configFixture } from './config';

// A gateway in full use, for looking at rather than testing against: two
// Claude seats, a Codex seat, SuperGrok, OpenCode Go and an OpenRouter key,
// shaped as omp 18.19.0 reports each. Times count from when the module loads,
// so every countdown reads as it would live.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.now();
const at = (ms: number): string => new Date(NOW + ms).toISOString();

/** A small seeded generator, so the made-up history is the same on every load. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Window {
  limit: Limit;
  /** How long the window runs. */
  span: number;
}

function limit(
  id: string,
  label: string,
  windowLabel: string,
  usedFraction: number,
  resetsIn: number,
  span: number,
  withSeconds = true
): Window {
  const status = usedFraction >= 1 ? 'exhausted' : usedFraction >= 0.8 ? 'warning' : 'ok';
  return {
    span,
    limit: {
      id,
      label,
      windowLabel,
      usedFraction,
      status,
      resetsAt: at(resetsIn),
      ...(withSeconds ? { windowSeconds: span / 1000 } : {}),
    },
  };
}

const claudeAda = {
  fiveHour: limit('anthropic:5h', 'Claude 5 Hour', '5 Hour', 0.62, 108 * MINUTE, 5 * HOUR),
  week: limit('anthropic:7d', 'Claude 7 Day', '7 Day', 0.83, 4 * DAY + 2 * HOUR, 7 * DAY),
  fable: limit('anthropic:7d:fable', 'Claude 7 Day (Fable)', '7 Day', 0.71, 4 * DAY + 2 * HOUR, 7 * DAY),
};
const claudeGrace = {
  fiveHour: limit('anthropic:5h', 'Claude 5 Hour', '5 Hour', 1, 80 * MINUTE, 5 * HOUR),
  week: limit('anthropic:7d', 'Claude 7 Day', '7 Day', 0.97, 19 * HOUR, 7 * DAY),
  fable: limit('anthropic:7d:fable', 'Claude 7 Day (Fable)', '7 Day', 0.88, 19 * HOUR, 7 * DAY),
};
const codex = {
  primary: limit('openai-codex:primary', '5 hours', '5 hours', 0.34, 3 * HOUR + 20 * MINUTE, 5 * HOUR),
  secondary: limit('openai-codex:secondary', '7 days', '7 days', 0.58, 3 * DAY + 10 * HOUR, 7 * DAY),
};
const grok = {
  credits: limit('xai-oauth:credits:1w', 'SuperGrok Weekly Credits', 'Weekly', 0.47, 4 * DAY, 7 * DAY),
  included: limit('xai-oauth:included:1mo', 'SuperGrok Monthly Included', 'Monthly', 0.22, 18 * DAY, 30 * DAY),
};
const opencode = {
  rolling: limit('rolling-5h', '5 Hour limit', '5 Hour', 0.18, 3 * HOUR, 5 * HOUR),
  weekly: limit('weekly', 'Weekly limit', 'Weekly', 0.41, 5 * DAY, 7 * DAY),
  // omp gives OpenCode Go's month no length: it is a rolling 30 days.
  monthly: limit('monthly', 'Monthly limit', 'Monthly', 0.27, 12 * DAY, 30 * DAY, false),
};

const limits = (windows: Record<string, Window>): Limit[] => Object.values(windows).map(window => window.limit);

const showcaseAccounts: AccountList = {
  gateway: { reachable: true, updatedAt: at(-4000) },
  gatewayVersion: '18.19.0',
  broker: { reachable: true, updatedAt: at(-4000) },
  accounts: [
    {
      id: '5e1ec7ed0000a001',
      provider: 'anthropic',
      kind: 'oauth',
      email: 'ada@example.com',
      orgName: 'Analytical Engines',
      paused: false,
      pausable: true,
      blocks: [],
      limits: limits(claudeAda),
      resets: {
        available: 2,
        usable: 1,
        soonestExpiresAt: at(27 * DAY),
        saved: [
          {
            title: 'One full limit reset (November 2026)',
            usable: true,
            clears: ['anthropic:7d', 'anthropic:7d:fable'],
            expiresAt: at(27 * DAY),
          },
          {
            title: 'New model launch: one Fable reset for Max, Team Premium and Enterprise Premium',
            usable: false,
            clears: ['anthropic:5h', 'anthropic:7d:fable'],
            expiresAt: at(116 * DAY),
          },
        ],
      },
      fetchedAt: at(-9000),
    },
    {
      id: '5e1ec7ed0000a002',
      provider: 'anthropic',
      kind: 'oauth',
      email: 'grace@example.com',
      orgName: 'Compilers Ltd',
      // Paused from here, and blocked by omp until its 5-hour window resets.
      paused: true,
      pausable: true,
      blockedUntil: at(80 * MINUTE),
      blocks: [{ scope: 'anthropic:5h', until: at(80 * MINUTE) }],
      limits: limits(claudeGrace),
      resets: { available: 1, usable: 0, soonestExpiresAt: at(116 * DAY) },
      fetchedAt: at(-31_000),
    },
    {
      id: '5e1ec7ed0000c001',
      provider: 'openai-codex',
      kind: 'oauth',
      email: 'linus@example.com',
      plan: 'pro',
      paused: false,
      pausable: true,
      blocks: [],
      limits: limits(codex),
      resets: { available: 1, soonestExpiresAt: at(29 * DAY), saved: [{ clears: [], expiresAt: at(29 * DAY) }] },
      fetchedAt: at(-14_000),
    },
    {
      id: '5e1ec7ed0000e001',
      provider: 'xai-oauth',
      kind: 'oauth',
      email: 'margaret@example.com',
      plan: 'SuperGrok',
      paused: false,
      pausable: true,
      blocks: [],
      limits: limits(grok),
      fetchedAt: at(-22_000),
    },
    {
      id: '5e1ec7ed0000d001',
      provider: 'opencode-go',
      kind: 'api_key',
      plan: 'OpenCode Go',
      paused: false,
      pausable: true,
      blocks: [],
      limits: limits(opencode),
      fetchedAt: at(-48_000),
    },
    {
      id: '5e1ec7ed0000f001',
      provider: 'openrouter',
      kind: 'api_key',
      paused: false,
      pausable: true,
      blocks: [],
      limits: [],
    },
  ],
};

/**
 * A week of a limit's recorded usage, one point an hour: each past window
 * climbs to a peak of its own and resets; the current one climbs to where the
 * limit stands now.
 */
function history(
  accountId: string,
  { limit: { id, usedFraction = 0, resetsAt }, span }: Window,
  seed: number
): UsageTrend {
  const next = random(seed);
  const resets = Date.parse(resetsAt ?? at(span));
  const steps = 7 * 24;
  const start = Math.floor(NOW / HOUR) * HOUR - (steps - 1) * HOUR;
  const peaks = new Map<number, number>();
  const points = Array.from({ length: steps }, (_, step) => {
    const time = Math.min(start + step * HOUR, NOW);
    const windowStart = resets - span * Math.ceil((resets - time) / span);
    const current = windowStart + span === resets;
    const done = (time - windowStart) / (current ? NOW - windowStart : span);
    if (!peaks.has(windowStart)) peaks.set(windowStart, 0.45 + next() * 0.55);
    const peak = current ? usedFraction : (peaks.get(windowStart) ?? 0.7);
    const wobble = current && done === 1 ? 0 : (next() - 0.5) * 0.02;
    const used = Math.min(1, Math.max(0, peak * done ** 1.15 + wobble));
    return { at: new Date(time).toISOString(), usedFraction: Math.round(used * 1000) / 1000 };
  });
  return { accountId, limitId: id, points };
}

const showcaseTrends: UsageTrendList = {
  trends: [
    ...Object.values(claudeAda).map((window, index) => history('5e1ec7ed0000a001', window, 11 + index)),
    ...Object.values(claudeGrace).map((window, index) => history('5e1ec7ed0000a002', window, 21 + index)),
    ...Object.values(codex).map((window, index) => history('5e1ec7ed0000c001', window, 31 + index)),
    ...Object.values(grok).map((window, index) => history('5e1ec7ed0000e001', window, 41 + index)),
    ...Object.values(opencode).map((window, index) => history('5e1ec7ed0000d001', window, 51 + index)),
  ],
};

interface Rate {
  provider: string;
  /** Dollars an hour at the height of the working day. */
  peak: number;
  /** Chance an hour has any traffic at all. */
  busy: number;
  /** Tokens per request, and cost per request, set by how the provider is used. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  perRequest: number;
}

const RATES: readonly Rate[] = [
  {
    provider: 'anthropic',
    peak: 16,
    busy: 0.95,
    input: 3,
    output: 950,
    cacheRead: 185_000,
    cacheWrite: 6500,
    perRequest: 0.14,
  },
  {
    provider: 'openai-codex',
    peak: 4.2,
    busy: 0.7,
    input: 2400,
    output: 1300,
    cacheRead: 96_000,
    cacheWrite: 0,
    perRequest: 0.09,
  },
  {
    provider: 'xai-oauth',
    peak: 2.1,
    busy: 0.35,
    input: 5200,
    output: 2100,
    cacheRead: 40_000,
    cacheWrite: 0,
    perRequest: 0.05,
  },
  {
    provider: 'opencode-go',
    peak: 0.5,
    busy: 0.5,
    input: 3800,
    output: 800,
    cacheRead: 22_000,
    cacheWrite: 0,
    perRequest: 0.004,
  },
  {
    provider: 'openrouter',
    peak: 1.2,
    busy: 0.25,
    input: 9000,
    output: 1500,
    cacheRead: 0,
    cacheWrite: 0,
    perRequest: 0.02,
  },
];

/** How busy an hour of the week is: the working day, quieter at weekends, near nothing at night. */
function workload(time: number): number {
  const date = new Date(time);
  const hour = date.getHours() + date.getMinutes() / 60;
  const day = Math.max(0, Math.sin(((hour - 7) / 15) * Math.PI));
  const weekend = date.getDay() === 0 || date.getDay() === 6 ? 0.35 : 1;
  return 0.04 + day * weekend;
}

/** One provider's series: each step's cost, and the requests and tokens that cost buys. */
function series(
  rate: Rate,
  start: number,
  step: number,
  steps: number,
  seed: number
): TrafficSeries['providers'][number] {
  const next = random(seed);
  const scale = step / HOUR;
  const costUsd = Array.from({ length: steps }, (_, index) => {
    if (next() > rate.busy) return 0;
    const cost = rate.peak * scale * workload(start + index * step) * (0.4 + next() * 1.2);
    return Math.round(cost * 100) / 100;
  });
  const requests = costUsd.map(cost => Math.round(cost / rate.perRequest));
  return {
    provider: rate.provider,
    costUsd,
    requests,
    inputTokens: requests.map(count => count * rate.input),
    outputTokens: requests.map(count => count * rate.output),
    cacheReadTokens: requests.map(count => count * rate.cacheRead),
    cacheWriteTokens: requests.map(count => count * rate.cacheWrite),
  };
}

const hourStart = Math.floor(NOW / HOUR) * HOUR - 167 * HOUR;
const minuteStart = Math.floor(NOW / MINUTE) * MINUTE - 59 * MINUTE;
const hours: TrafficSeries = {
  start: new Date(hourStart).toISOString(),
  stepSeconds: 3600,
  steps: 168,
  providers: RATES.map((rate, index) => series(rate, hourStart, HOUR, 168, 101 + index)),
};
const minutes: TrafficSeries = {
  start: new Date(minuteStart).toISOString(),
  stepSeconds: 60,
  steps: 60,
  providers: RATES.map((rate, index) => series(rate, minuteStart, MINUTE, 60, 201 + index)),
};

/** A provider's counts over its series' last `steps` steps. */
function total(provider: TrafficSeries['providers'][number], steps: number): TrafficCounts {
  const sum = (values: number[]): number => values.slice(-steps).reduce((all, value) => all + value, 0);
  return {
    requests: sum(provider.requests),
    inputTokens: sum(provider.inputTokens),
    outputTokens: sum(provider.outputTokens),
    cacheReadTokens: sum(provider.cacheReadTokens),
    cacheWriteTokens: sum(provider.cacheWriteTokens),
    costUsd: Math.round(sum(provider.costUsd) * 100) / 100,
  };
}

function add(all: TrafficCounts, more: TrafficCounts): TrafficCounts {
  return {
    requests: all.requests + more.requests,
    inputTokens: all.inputTokens + more.inputTokens,
    outputTokens: all.outputTokens + more.outputTokens,
    cacheReadTokens: all.cacheReadTokens + more.cacheReadTokens,
    cacheWriteTokens: all.cacheWriteTokens + more.cacheWriteTokens,
    costUsd: Math.round((all.costUsd + more.costUsd) * 100) / 100,
  };
}

const ZERO: TrafficCounts = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
};

/** A window's totals: the providers that sent anything in it, busiest first. */
function trafficWindow(id: TrafficWindow['id'], since: number, from: TrafficSeries, steps: number): TrafficWindow {
  const providers = from.providers
    .map(provider => ({ provider: provider.provider, counts: total(provider, steps) }))
    .filter(({ counts }) => counts.requests > 0)
    .sort((one, other) => other.counts.costUsd - one.counts.costUsd);
  return {
    id,
    since: at(-since),
    total: providers.reduce((all, { counts }) => add(all, counts), ZERO),
    providers,
  };
}

const week = trafficWindow('week', 7 * DAY, hours, 168);

const showcaseTraffic: Traffic = {
  available: true,
  updatedAt: at(-6000),
  // Measured for the last three days; the days before are estimated.
  measuredSince: at(-3 * DAY),
  windows: [trafficWindow('hour', HOUR, minutes, 60), trafficWindow('day', DAY, hours, 24), week],
  minutes,
  hours,
  clients: week.providers.flatMap(({ provider, counts }) => [
    { installId: 'install-gateway', hostname: 'gateway', app: 'gateway', provider, counts },
  ]),
};

/** Everything the homepage asks for, answered with the showcase. */
export const showcaseHandlers = [
  http.get('/api/v1/config', () => HttpResponse.json(configFixture)),
  http.get('/api/v1/accounts', () => HttpResponse.json(showcaseAccounts)),
  http.get('/api/v1/trends', () => HttpResponse.json(showcaseTrends)),
  http.get('/api/v1/traffic', () => HttpResponse.json(showcaseTraffic)),
];
