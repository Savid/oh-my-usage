import { describe, expect, it } from 'vitest';
import type { Account, Limit } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { gatewayPriority, ordinal } from './priority';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const week = (used: number | undefined, resetsIn = 3 * DAY, id = 'anthropic:7d'): Limit => ({
  id,
  label: 'Claude 7 Day',
  usedFraction: used,
  resetsAt: at(resetsIn),
  windowSeconds: 7 * 86_400,
});
const session = (used: number, id = 'anthropic:5h'): Limit => ({
  id,
  label: 'Claude 5 Hour',
  usedFraction: used,
  resetsAt: at(2 * HOUR),
  windowSeconds: 5 * 3600,
});

function seat(id: string, limits: Limit[], extra: Partial<Account> = {}): Account {
  return { id, provider: 'anthropic', kind: 'oauth', paused: false, pausable: true, blocks: [], limits, ...extra };
}

const ranks = (accounts: Account[]): Record<string, string> =>
  Object.fromEntries(
    [...gatewayPriority(accounts, NOW_MS)]
      .sort(([, a], [, b]) => a.position - b.position)
      .map(([id, p]) => [id, `${p.rank === undefined ? p.standing : ordinal(p.rank)} · ${p.reason}`])
  );

describe('gatewayPriority', () => {
  it('picks first the account whose unused quota would go to waste soonest', () => {
    expect(
      ranks([seat('slow', [week(0.2, 6 * DAY)]), seat('soon', [week(0.4, 2 * DAY)]), seat('full', [week(0.7, DAY)])])
    ).toEqual({
      // 30% in a day beats 60% in two, which beats 80% in six.
      full: '1st · 30% left',
      soon: '2nd · 60% left',
      slow: '3rd · 80% left',
    });
  });

  it('counts a saved reset that lapses before the window resets as the deadline', () => {
    const lapsing = seat('lapsing', [week(0.5, 5 * DAY)], {
      resets: { available: 1, saved: [{ clears: ['anthropic:7d'], usable: true, expiresAt: at(DAY) }] },
    });
    // One that outlives the window, or cannot be spent, changes nothing.
    const later = seat('later', [week(0.5, 5 * DAY)], {
      resets: {
        available: 2,
        saved: [
          { clears: ['anthropic:7d'], usable: true, expiresAt: at(6 * DAY) },
          { clears: ['anthropic:7d'], usable: false, expiresAt: at(DAY) },
        ],
      },
    });
    expect(ranks([later, seat('soon', [week(0.4, 2 * DAY)]), lapsing])).toEqual({
      lapsing: '1st · reset lapses in 1d',
      soon: '2nd · 60% left',
      later: '3rd · 50% left',
    });
  });

  it('holds back an account in its reserve or with its short window nearly full', () => {
    expect(
      ranks([
        seat('reserve', [week(0.95)]),
        seat('hot', [session(0.86), week(0.2)]),
        seat('free', [session(0.1), week(0.5)]),
      ])
    ).toEqual({ free: '1st · 50% left', hot: 'later · 5h nearly full', reserve: 'later · under 10%' });
  });

  it('puts paused, blocked and spent accounts last, the soonest unblocked first', () => {
    expect(
      ranks([
        seat('paused', [week(0.1)], { paused: true }),
        seat('spent', [week(1)]),
        seat('blocked', [week(0.1)], { blockedUntil: at(HOUR) }),
        seat('free', [week(0.5)]),
      ])
    ).toEqual({
      free: '1st · 50% left',
      blocked: 'last · blocked',
      spent: 'last · spent',
      paused: 'last · paused',
    });
  });

  it("ignores a model's own limit, which does not gate other requests", () => {
    const fable = { ...week(1), id: 'anthropic:7d:fable', label: 'Claude 7 Day (Fable)' };
    expect(ranks([seat('fable', [week(0.5), fable])])).toEqual({ fable: '1st · 50% left' });
  });

  it('ranks an account with no usage after measured ones', () => {
    expect(ranks([seat('dark', []), seat('lit', [week(0.5)])])).toEqual({
      lit: '1st · 50% left',
      dark: '2nd · no usage',
    });
  });

  it('ranks each provider apart, and favours a Codex account with an untouched 5-hour window', () => {
    const codex = (id: string, short: number): Account =>
      seat(id, [session(short, 'openai-codex:primary'), week(0.2, 3 * DAY, 'openai-codex:secondary')], {
        provider: 'openai-codex',
      });
    expect(ranks([seat('claude', [week(0.5)]), codex('busy', 0.3), codex('fresh', 0)])).toEqual({
      claude: '1st · 50% left',
      fresh: '1st · 5h untouched',
      busy: '2nd · 80% left',
    });
  });

  it('leaves out API keys and accounts the broker does not hold', () => {
    const picks = gatewayPriority(
      [seat('key', [week(0.5)], { kind: 'api_key' }), seat('stray', [week(0.5)], { pausable: false })],
      NOW_MS
    );
    expect(picks.size).toBe(0);
  });
});

describe('ordinal', () => {
  it('names a place', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
      '111th',
    ]);
  });
});
