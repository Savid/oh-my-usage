import type { JSX } from 'react';
import { useConfig } from '@/hooks/useConfig';
import { useNow } from '@/hooks/useNow';
import { headlinePools, poolLimits } from '@/lib/pools';
import { AccountRow } from './components/AccountRow';
import { PoolTile } from './components/PoolTile';
import { SourceAlerts } from './components/SourceAlerts';
import { useAccounts } from './hooks/useAccounts';
import { useCharts } from './hooks/useCharts';

/**
 * The whole fleet on one screen. First, for each provider, how much of its
 * main usage window is used in total and when it resets; then every account
 * on a line of its own, drawn over the last seven days of what it had used.
 */
export function AccountsPage(): JSX.Element {
  const now = useNow();
  const config = useConfig();
  const accounts = useAccounts();
  const charts = useCharts(now);
  const controls = config.data?.controls ?? false;
  const list = accounts.data;
  const pools = list ? headlinePools(poolLimits(list.accounts, now)) : [];

  return (
    <section className="flex flex-col gap-2">
      <h1 className="sr-only">Accounts</h1>

      {accounts.isPending ? (
        <p role="status" className="px-1 text-caption text-muted">
          Loading the accounts…
        </p>
      ) : !list ? (
        <p role="alert" className="px-1 text-caption text-danger">
          Could not reach oh-my-usage.
        </p>
      ) : (
        <>
          <SourceAlerts list={list} stale={accounts.isError} now={now} />
          {charts.failed && (
            <p role="alert" className="px-1 text-caption text-danger">
              Could not load the usage history. The rows show current levels only.
            </p>
          )}

          {pools.length > 0 && (
            <section aria-label="Totals" className="flex flex-wrap gap-2">
              {pools.map(pool => (
                <PoolTile key={pool.provider} pool={pool} now={now} />
              ))}
            </section>
          )}

          {list.accounts.length === 0 ? (
            <p className="px-1 text-caption text-muted">The gateway reports no accounts.</p>
          ) : (
            <section
              aria-label="Every account"
              className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface"
            >
              {list.accounts.map(account => (
                <AccountRow
                  key={account.id}
                  account={account}
                  trends={charts.trends}
                  start={charts.since}
                  now={now}
                  controls={controls}
                  headingLevel={2}
                />
              ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}
