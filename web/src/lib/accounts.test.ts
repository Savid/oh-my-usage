import { describe, expect, it } from 'vitest';
import type { Account } from '@/api';
import {
  accountTitle,
  groupByProvider,
  leftFraction,
  primaryLimit,
  limitSeverity,
  providerName,
  severityOf,
  shortLimitLabel,
} from './accounts';

const base: Account = { id: '00000000000000a1', provider: 'anthropic', paused: false, pausable: false, limits: [] };

describe('providerName', () => {
  it('names the providers it knows and passes the rest through', () => {
    expect(providerName('openai-codex')).toBe('OpenAI Codex');
    expect(providerName('some-new-provider')).toBe('some-new-provider');
  });
});

describe('accountTitle', () => {
  it('prefers the email, then the kind of credential', () => {
    expect(accountTitle({ ...base, email: 'one@example.com' })).toBe('one@example.com');
    expect(accountTitle({ ...base, kind: 'api_key' })).toBe('Anthropic API key');
    expect(accountTitle(base)).toBe('Anthropic account');
  });
});

describe('groupByProvider', () => {
  it('groups accounts and keeps the order they arrived in', () => {
    const groups = groupByProvider([
      { ...base, id: 'a' },
      { ...base, id: 'b', provider: 'openrouter' },
      { ...base, id: 'c' },
    ]);

    expect(groups.map(group => [group.provider, group.accounts.map(account => account.id)])).toEqual([
      ['anthropic', ['a', 'c']],
      ['openrouter', ['b']],
    ]);
  });
});

describe('shortLimitLabel', () => {
  it('drops the product in front and the word limit behind', () => {
    expect(shortLimitLabel({ id: 'a', label: 'Claude 7 Day (Fable)' })).toBe('7 Day Fable');
    expect(shortLimitLabel({ id: 'b', label: 'Weekly limit' })).toBe('Weekly');
    expect(shortLimitLabel({ id: 'c', label: '7 days' })).toBe('7 days');
    expect(shortLimitLabel({ id: 'd', label: 'Claude' })).toBe('Claude');
  });
});

describe('primaryLimit', () => {
  const later = '2026-10-01T00:00:00Z';
  const sooner = '2026-09-27T00:00:00Z';

  it('takes the window whose reset is furthest away, the first on a tie', () => {
    const limits = [
      { id: '5h', label: '5 Hour', usedFraction: 0.9, resetsAt: sooner },
      { id: '7d', label: '7 Day', usedFraction: 0.3, resetsAt: later },
      { id: '7d:fable', label: '7 Day (Fable)', usedFraction: 0.2, resetsAt: later },
    ];

    expect(primaryLimit(limits)?.id).toBe('7d');
  });

  it('skips windows that report no usage, and copes without reset times', () => {
    expect(
      primaryLimit([
        { id: '5h', label: '5 Hour', resetsAt: later },
        { id: 'a', label: 'A', usedFraction: 0.1 },
        { id: 'b', label: 'B', usedFraction: 0.2 },
      ])?.id
    ).toBe('a');
    expect(primaryLimit([{ id: '5h', label: '5 Hour' }])).toBeUndefined();
    expect(primaryLimit([])).toBeUndefined();
  });
});

describe('leftFraction', () => {
  it('is what is not used, between nothing and all of it', () => {
    expect(leftFraction({ id: 'a', label: 'A', usedFraction: 0.76 })).toBeCloseTo(0.24);
    expect(leftFraction({ id: 'a', label: 'A', usedFraction: 1.4 })).toBe(0);
    expect(leftFraction({ id: 'a', label: 'A', usedFraction: 0 })).toBe(1);
    expect(leftFraction({ id: 'a', label: 'A' })).toBeUndefined();
  });
});

describe('severityOf', () => {
  it('warns at a fifth left and alarms at none', () => {
    expect(severityOf(1)).toBe('normal');
    expect(severityOf(0.21)).toBe('normal');
    expect(severityOf(1 - 0.8)).toBe('warn');
    expect(severityOf(0.01)).toBe('warn');
    expect(severityOf(0)).toBe('danger');
  });
});

describe('limitSeverity', () => {
  it("follows the provider's status, then the used share", () => {
    const limit = { id: '7d', label: '7 Day' };
    expect(limitSeverity(limit)).toBe('normal');
    expect(limitSeverity({ ...limit, usedFraction: 0.79, status: 'ok' })).toBe('normal');
    expect(limitSeverity({ ...limit, usedFraction: 0.8 })).toBe('warn');
    expect(limitSeverity({ ...limit, usedFraction: 0.2, status: 'warning' })).toBe('warn');
    expect(limitSeverity({ ...limit, usedFraction: 1 })).toBe('danger');
    expect(limitSeverity({ ...limit, usedFraction: 0.5, status: 'exhausted' })).toBe('danger');
  });
});
