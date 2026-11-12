import { describe, expect, it } from 'vitest';
import type { Account } from '@/api';
import { accountTitle, groupByProvider, limitSeverity, providerName } from './accounts';

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
    expect(accountTitle({ ...base, kind: 'api_key' })).toBe('API key');
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
