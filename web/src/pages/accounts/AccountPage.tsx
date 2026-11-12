import { useState, type JSX } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { getAccountHistoryOptions } from '@/api/@tanstack/react-query.gen';
import { useConfig } from '@/hooks/useConfig';
import { useNow } from '@/hooks/useNow';
import { providerName } from '@/lib/accounts';
import type { AccountPageProps } from './AccountPage.types';
import { AccountCard } from './components/AccountCard';
import { SourceAlerts } from './components/SourceAlerts';
import { UsageHistoryChart } from './components/UsageHistoryChart';
import { useAccounts } from './hooks/useAccounts';

const HOUR = 3_600_000;

const RANGES = [
  { id: '24h', label: '24 hours', ms: 24 * HOUR },
  { id: '7d', label: '7 days', ms: 7 * 24 * HOUR },
  { id: '30d', label: '30 days', ms: 30 * 24 * HOUR },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

/**
 * The history's start moves in steps of this, so the query's key holds still
 * between steps and the chart refetches once per step.
 */
const SINCE_STEP_MS = 5 * 60_000;

/** One account: its card, and its recorded usage over a chosen period. */
export function AccountPage({ accountId }: AccountPageProps): JSX.Element {
  const now = useNow();
  const config = useConfig();
  const accounts = useAccounts();
  const [range, setRange] = useState<RangeId>('7d');

  const span = RANGES.find(candidate => candidate.id === range)?.ms ?? 0;
  const since = new Date(Math.floor(now / SINCE_STEP_MS) * SINCE_STEP_MS - span).toISOString();
  const history = useQuery({
    ...getAccountHistoryOptions({ path: { accountId }, query: { since } }),
    // Keep the drawn period on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  const account = accounts.data?.accounts.find(candidate => candidate.id === accountId);

  return (
    <section className="mx-auto flex max-w-page flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to="/" className="text-body text-accent underline underline-offset-4">
          All accounts
        </Link>
        <h1 className="text-heading font-semibold">{account ? providerName(account.provider) : 'Account'}</h1>
      </div>

      {accounts.isPending ? (
        <p role="status" className="text-body text-muted">
          Loading the account…
        </p>
      ) : !accounts.data ? (
        <p role="alert" className="text-body text-danger">
          Could not reach oh-my-usage.
        </p>
      ) : (
        <>
          <SourceAlerts list={accounts.data} stale={accounts.isError} now={now} />
          {account ? (
            <AccountCard account={account} now={now} controls={config.data?.controls ?? false} headingLevel={2} />
          ) : (
            <p className="text-body text-muted">The gateway no longer reports this account.</p>
          )}
        </>
      )}

      <section
        aria-labelledby="history-heading"
        className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="history-heading" className="text-title font-semibold">
            Usage history
          </h2>
          <div role="group" aria-label="Period" className="flex gap-2">
            {RANGES.map(option => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === range}
                onClick={() => setRange(option.id)}
                className="rounded-sm border border-border-strong px-3 py-1 text-body hover:bg-background aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {history.isPending ? (
          <p role="status" className="text-body text-muted">
            Loading the usage history…
          </p>
        ) : !history.data ? (
          <p role="alert" className="text-body text-danger">
            Could not load the usage history.
          </p>
        ) : (
          <>
            {history.isError && (
              <p role="alert" className="text-body text-danger">
                Could not refresh the usage history. This is the last period that loaded.
              </p>
            )}
            <UsageHistoryChart samples={history.data.samples} />
          </>
        )}
      </section>
    </section>
  );
}
