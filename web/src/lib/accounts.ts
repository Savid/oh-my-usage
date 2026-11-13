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

/** What to call an account: its email, or its provider and what kind of credential it is. */
export function accountTitle(account: Account): string {
  if (account.email) return account.email;
  return `${providerName(account.provider)} ${account.kind === 'api_key' ? 'API key' : 'account'}`;
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

/**
 * A limit's name without what the row already says: the product's name in
 * front ("Claude 7 Day") and the word "limit" behind ("Weekly limit").
 */
export function shortLimitLabel(limit: Limit): string {
  const short = limit.label
    .replace(/^Claude\s+/i, '')
    .replace(/\s+limit$/i, '')
    .replace(/[()]/g, '');
  return short || limit.label;
}

/**
 * The window an account's row is drawn for: of those that report usage, the
 * one whose reset is furthest away, which is the budget the account lives on
 * (a week, not five hours). Ties go to the first listed; without any reset
 * time, the first that reports usage.
 */
export function primaryLimit(limits: readonly Limit[]): Limit | undefined {
  let best: Limit | undefined;
  let bestReset = -Infinity;
  for (const limit of limits) {
    if (limit.usedFraction === undefined) continue;
    const reset = limit.resetsAt ? Date.parse(limit.resetsAt) : -Infinity;
    if (!best || reset > bestReset) {
      best = limit;
      bestReset = reset;
    }
  }
  return best;
}

/** How close a limit is to stopping the account. */
export type LimitSeverity = 'normal' | 'warn' | 'danger';

/** At or below this share left, a limit is drawn as a warning. */
const WARN_LEFT = 0.2;

/** The share of a limit still unused, from 0 to 1; nothing when the provider reported no amount. */
export function leftFraction(limit: Limit): number | undefined {
  return limit.usedFraction === undefined ? undefined : Math.min(1, Math.max(0, 1 - limit.usedFraction));
}

/** The severity of a share left: spent, nearly spent, or neither. */
export function severityOf(left: number): LimitSeverity {
  // A sliver above the threshold in floating point (1 - 0.8) still counts as at it.
  if (left <= 0) return 'danger';
  if (left <= WARN_LEFT + 1e-9) return 'warn';
  return 'normal';
}

/** A limit's severity, from the provider's own status first and its share left second. */
export function limitSeverity(limit: Limit): LimitSeverity {
  const fromShare = severityOf(leftFraction(limit) ?? 1);
  if (limit.status === 'exhausted' || fromShare === 'danger') return 'danger';
  if (limit.status === 'warning' || fromShare === 'warn') return 'warn';
  return 'normal';
}
