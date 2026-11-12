import type { Account, Limit } from '@/api';

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  'openai-codex': 'OpenAI Codex',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  'opencode-go': 'OpenCode Go',
  'google-gemini-cli': 'Google Gemini',
};

/** A provider's display name; an ID this build does not know is shown as it is. */
export function providerName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

/** What to call an account: its email, or what kind of credential it is. */
export function accountTitle(account: Account): string {
  if (account.email) return account.email;
  return account.kind === 'api_key' ? 'API key' : `${providerName(account.provider)} account`;
}

export interface ProviderGroup {
  provider: string;
  accounts: Account[];
}

/** Accounts grouped by provider, keeping the order the server sent. */
export function groupByProvider(accounts: readonly Account[]): ProviderGroup[] {
  const groups: ProviderGroup[] = [];
  for (const account of accounts) {
    const group = groups.find(candidate => candidate.provider === account.provider);
    if (group) group.accounts.push(account);
    else groups.push({ provider: account.provider, accounts: [account] });
  }
  return groups;
}

/** How close a limit is to stopping the account. */
export type LimitSeverity = 'normal' | 'warn' | 'danger';

/** Above this used share a limit is drawn as a warning. */
const WARN_FRACTION = 0.8;

/** A limit's severity, from the provider's own status first and its used share second. */
export function limitSeverity(limit: Limit): LimitSeverity {
  const used = limit.usedFraction ?? 0;
  if (limit.status === 'exhausted' || used >= 1) return 'danger';
  if (limit.status === 'warning' || used >= WARN_FRACTION) return 'warn';
  return 'normal';
}
