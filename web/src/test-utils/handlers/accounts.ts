import { delay, http, HttpResponse } from 'msw';
import type { Account, AccountList, PauseRequest, UsageHistory, UsageSample, UsageTrendList } from '@/api';
import { at } from '@/test-utils/time';

const HOUR = 3_600_000;

/** A Claude seat with a broker credential, most of its week used. */
export const seatFixture: Account = {
  id: '00000000000000a1',
  provider: 'anthropic',
  kind: 'oauth',
  email: 'one@example.com',
  orgName: 'One Org',
  paused: false,
  pausable: true,
  limits: [
    { id: 'anthropic:5h', label: 'Claude 5 Hour', windowLabel: '5 Hour' },
    {
      id: 'anthropic:7d',
      label: 'Claude 7 Day',
      windowLabel: '7 Day',
      usedFraction: 0.76,
      status: 'ok',
      resetsAt: at(21 * HOUR),
    },
    {
      id: 'anthropic:7d:fable',
      label: 'Claude 7 Day (Fable)',
      windowLabel: '7 Day',
      usedFraction: 0.92,
      status: 'warning',
      resetsAt: at(21 * HOUR),
    },
  ],
  resets: { available: 2, usable: 1, soonestExpiresAt: at(28 * 24 * HOUR) },
  fetchedAt: at(-12_000),
};

/** A second seat, paused, with its 5-hour window spent. */
export const pausedSeatFixture: Account = {
  id: '00000000000000a2',
  provider: 'anthropic',
  kind: 'oauth',
  email: 'two@example.com',
  orgName: 'Two Org',
  paused: true,
  pausable: true,
  blockedUntil: at(2 * HOUR),
  limits: [
    {
      id: 'anthropic:5h',
      label: 'Claude 5 Hour',
      windowLabel: '5 Hour',
      usedFraction: 1,
      status: 'exhausted',
      resetsAt: at(2 * HOUR),
    },
    { id: 'anthropic:7d', label: 'Claude 7 Day', usedFraction: 0.19, status: 'ok', resetsAt: at(33 * HOUR) },
  ],
  resets: { available: 3, usable: 0 },
  fetchedAt: at(-40_000),
};

/** An account the gateway reports that the broker does not hold: no kind, nothing to pause. */
export const strayFixture: Account = {
  id: '00000000000000c1',
  provider: 'openai-codex',
  email: 'codex@example.com',
  plan: 'pro',
  paused: false,
  pausable: false,
  limits: [{ id: 'codex:7d', label: '7 days', usedFraction: 0.66, status: 'ok', resetsAt: at(110 * HOUR) }],
  // Codex does not say how many of its resets can be spent now.
  resets: { available: 1 },
  fetchedAt: at(-90_000),
};

/** An API key with no usage report. */
export const keyFixture: Account = {
  id: '00000000000000d1',
  provider: 'openrouter',
  kind: 'api_key',
  paused: false,
  pausable: true,
  limits: [],
};

export const accountsFixture: AccountList = {
  accounts: [seatFixture, pausedSeatFixture, strayFixture, keyFixture],
  gateway: { reachable: true, updatedAt: at(-5000) },
  gatewayVersion: '18.19.0',
  broker: { reachable: true, updatedAt: at(-5000) },
};

/** The gateway and the broker both failing, with the last good accounts still listed. */
export const unreachableFixture: AccountList = {
  ...accountsFixture,
  gateway: { reachable: false, error: 'GET /v1/usage: connection refused', updatedAt: at(-20 * 60_000) },
  broker: { reachable: false, error: 'GET /v1/snapshot: HTTP 401: unauthorized', updatedAt: at(-20 * 60_000) },
};

/** Nothing read yet: the first poll failed. */
export const neverReachedFixture: AccountList = {
  accounts: [],
  gateway: { reachable: false, error: 'GET /v1/usage: connection refused' },
};

/** A limit's thinned history over the last week: `steps` points climbing from `from` by `perStep`. */
function trend(
  accountId: string,
  limitId: string,
  from: number,
  perStep: number,
  steps = 28
): UsageTrendList['trends'][number] {
  return {
    accountId,
    limitId,
    points: Array.from({ length: steps }, (_, step) => ({
      at: at((step - steps) * 6 * HOUR),
      usedFraction: Math.round((from + step * perStep) * 100) / 100,
    })),
  };
}

/** Recorded usage for the accounts that report any; the API key has none. */
export const trendsFixture: UsageTrendList = {
  trends: [
    trend(seatFixture.id, 'anthropic:7d', 0.06, 0.025),
    trend(seatFixture.id, 'anthropic:7d:fable', 0.2, 0.026),
    trend(pausedSeatFixture.id, 'anthropic:5h', 0.1, 0.033),
    trend(pausedSeatFixture.id, 'anthropic:7d', 0.02, 0.006),
    trend(strayFixture.id, 'codex:7d', 0.3, 0.013),
  ],
};

const LIST = '/api/v1/accounts';
const TRENDS = '/api/v1/trends';
const PAUSE = '/api/v1/accounts/:accountId/pause';
const HISTORY = '/api/v1/accounts/:accountId/history';

function findAccount(id: unknown): Account | undefined {
  return accountsFixture.accounts.find(account => account.id === id);
}

/** MSW handlers for the accounts operations, one per state a story needs. */
export const accountsHandlers = {
  ok: http.get(LIST, () => HttpResponse.json(accountsFixture)),
  empty: http.get(LIST, () => HttpResponse.json({ ...accountsFixture, accounts: [] } satisfies AccountList)),
  unreachable: http.get(LIST, () => HttpResponse.json(unreachableFixture)),
  neverReached: http.get(LIST, () => HttpResponse.json(neverReachedFixture)),
  down: http.get(LIST, () => new HttpResponse(null, { status: 502 })),
  pending: http.get(LIST, async () => {
    await delay('infinite');
    return HttpResponse.json(accountsFixture);
  }),
};

/** MSW handlers for GET /api/v1/trends. */
export const trendsHandlers = {
  ok: http.get(TRENDS, () => HttpResponse.json(trendsFixture)),
  empty: http.get(TRENDS, () => HttpResponse.json({ trends: [] } satisfies UsageTrendList)),
  down: http.get(TRENDS, () => new HttpResponse(null, { status: 502 })),
  pending: http.get(TRENDS, async () => {
    await delay('infinite');
    return HttpResponse.json(trendsFixture);
  }),
};

/** MSW handlers for PUT …/pause. `ok` answers the account with the requested state. */
export const pauseHandlers = {
  ok: http.put<{ accountId: string }, PauseRequest>(PAUSE, async ({ params, request }) => {
    const account = findAccount(params.accountId) ?? seatFixture;
    const { paused } = await request.json();
    return HttpResponse.json({ ...account, paused } satisfies Account);
  }),
  refused: http.put(PAUSE, () =>
    HttpResponse.json(
      { title: 'Bad Gateway', status: 502, detail: 'pause: POST /v1/credential/1/block: HTTP 401: unauthorized' },
      { status: 502, headers: { 'Content-Type': 'application/problem+json' } }
    )
  ),
  pending: http.put(PAUSE, async () => {
    await delay('infinite');
    return HttpResponse.json(seatFixture);
  }),
};

/** A week of the seat's two reporting limits: the week climbs, the Fable window resets midway. */
function week(): UsageSample[] {
  const samples: UsageSample[] = [];
  for (let step = 0; step <= 28; step += 1) {
    const time = at((step - 28) * 6 * HOUR);
    samples.push({
      at: time,
      limitId: 'anthropic:7d',
      label: 'Claude 7 Day',
      usedFraction: Math.round((0.06 + step * 0.025) * 100) / 100,
      resetsAt: at(21 * HOUR),
    });
    samples.push({
      at: time,
      limitId: 'anthropic:7d:fable',
      label: 'Claude 7 Day (Fable)',
      usedFraction: Math.round(((step < 14 ? step : step - 14) * 0.065 + 0.01) * 100) / 100,
    });
  }
  return samples;
}

export const historyFixture: UsageHistory = { samples: week() };

/** MSW handlers for GET …/history. */
export const historyHandlers = {
  ok: http.get(HISTORY, () => HttpResponse.json(historyFixture)),
  empty: http.get(HISTORY, () => HttpResponse.json({ samples: [] } satisfies UsageHistory)),
  down: http.get(HISTORY, () => new HttpResponse(null, { status: 502 })),
  pending: http.get(HISTORY, async () => {
    await delay('infinite');
    return HttpResponse.json(historyFixture);
  }),
};
