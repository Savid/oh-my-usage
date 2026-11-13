import type { JSX } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { getAccountHistoryOptions } from '@/api/@tanstack/react-query.gen';
import { useConfig } from '@/hooks/useConfig';
import { useNow } from '@/hooks/useNow';
import { providerName } from '@/lib/accounts';
import type { AccountPageProps } from './AccountPage.types';
import { AccountRow } from './components/AccountRow';
import { SourceAlerts } from './components/SourceAlerts';
import { UsageHistoryChart } from './components/UsageHistoryChart';
import { useAccounts } from './hooks/useAccounts';
import { useCharts } from './hooks/useCharts';

/** One account: its line, and its recorded usage over a chosen period. */
export function AccountPage({ accountId }: AccountPageProps): JSX.Element {
  const now = useNow();
  const config = useConfig();
  const accounts = useAccounts();
  const charts = useCharts(now);

  const history = useQuery({
    ...getAccountHistoryOptions({ path: { accountId }, query: { since: new Date(charts.since).toISOString() } }),
    // Keep the drawn period on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  const account = accounts.data?.accounts.find(candidate => candidate.id === accountId);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <Link to="/" className="text-body text-muted underline-offset-4 hover:text-foreground hover:underline">
          Accounts
        </Link>
        <span aria-hidden="true" className="text-body text-muted">
          /
        </span>
        <h1 className="text-body font-semibold">{account ? providerName(account.provider) : 'Account'}</h1>
      </div>

      {accounts.isPending ? (
        <p role="status" className="px-1 text-caption text-muted">
          Loading the account…
        </p>
      ) : !accounts.data ? (
        <p role="alert" className="text-caption text-danger">
          Could not reach oh-my-usage.
        </p>
      ) : (
        <>
          <SourceAlerts list={accounts.data} stale={accounts.isError} now={now} />
          {account ? (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <AccountRow
                account={account}
                trends={charts.trends}
                start={charts.since}
                now={now}
                controls={config.data?.controls ?? false}
                headingLevel={2}
              />
            </div>
          ) : (
            <p className="text-caption text-muted">The gateway no longer reports this account.</p>
          )}
        </>
      )}

      <section
        aria-labelledby="history-heading"
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
      >
        <h2 id="history-heading" className="text-micro font-semibold tracking-caps text-muted uppercase">
          Quota left, last 7 days
        </h2>

        {history.isPending ? (
          <p role="status" className="text-caption text-muted">
            Loading the usage history…
          </p>
        ) : !history.data ? (
          <p role="alert" className="text-caption text-danger">
            Could not load the usage history.
          </p>
        ) : (
          <>
            {history.isError && (
              <p role="alert" className="text-caption text-danger">
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
