import { useState, type JSX } from 'react';
import { useConfig } from '@/hooks/useConfig';
import { useNow } from '@/hooks/useNow';
import { useTraffic } from '@/hooks/useTraffic';
import { fleetOf, orderAccounts, viewAccount, type AccountOrder } from '@/lib/fleet';
import { headlinePools, poolLimits } from '@/lib/pools';
import { AccountRow } from './components/AccountRow';
import { AccountsToolbar } from './components/AccountsToolbar';
import { FleetSummary } from './components/FleetSummary';
import { PoolTile } from './components/PoolTile';
import { Pulse } from './components/Pulse';
import { SourceAlerts } from './components/SourceAlerts';
import { useAccounts } from './hooks/useAccounts';
import { useCharts } from './hooks/useCharts';

/**
 * The whole fleet on one screen. A line of figures for the fleet; for each
 * provider, how much of its main usage window is used in total and when it
 * resets; with a broker, the gateway's pulse; then every account on a row of
 * its own row, its windows read against their clocks as meters and a
 * runway, riskiest first unless another order is picked.
 */
export function AccountsPage(): JSX.Element {
  const now = useNow();
  const config = useConfig();
  const accounts = useAccounts();
  const charts = useCharts(now);
  const traffic = useTraffic();
  const controls = config.data?.controls ?? false;
  const list = accounts.data;
  const [order, setOrder] = useState<AccountOrder>('risk');
  const pools = list ? headlinePools(poolLimits(list.accounts, now)) : [];
  const views = list ? list.accounts.map(account => viewAccount(account, charts.trends, now)) : [];
  const fleet = fleetOf(views);

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
          <FleetSummary fleet={fleet} updatedAt={list.gateway.updatedAt} now={now} />
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

          {/* Without a broker there is no traffic to read, and nothing is said about it. */}
          {traffic.isPending ? (
            <p role="status" className="px-1 text-caption text-muted">
              Loading the traffic…
            </p>
          ) : !traffic.data ? (
            <p role="alert" className="px-1 text-caption text-danger">
              Could not load the traffic.
            </p>
          ) : (
            traffic.data.available && <Pulse traffic={traffic.data} monthlyUsd={fleet.monthlyUsd} now={now} />
          )}

          {list.accounts.length === 0 ? (
            <p className="px-1 text-caption text-muted">The gateway reports no accounts.</p>
          ) : (
            <section aria-label="Every account" className="flex flex-col gap-2">
              <AccountsToolbar count={views.length} order={order} onOrder={setOrder} />
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                {orderAccounts(views, order).map(view => (
                  <AccountRow
                    key={view.account.id}
                    account={view.account}
                    trends={charts.trends}
                    start={charts.since}
                    now={now}
                    controls={controls}
                    headingLevel={3}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
