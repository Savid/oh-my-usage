import { useState, type JSX } from 'react';
import { PageHeader } from '@/components/Layout/PageHeader';
import { useConfig } from '@/hooks/useConfig';
import { useNow } from '@/hooks/useNow';
import { useTraffic } from '@/hooks/useTraffic';
import { fleetOf, orderAccounts, viewAccount, type AccountOrder } from '@/lib/fleet';
import { gatewayPriority, type Priority } from '@/lib/priority';
import { headlinePools, poolLimits } from '@/lib/pools';
import { AccountRow } from './components/AccountRow';
import { AccountsToolbar } from './components/AccountsToolbar';
import { FleetBand } from './components/FleetBand';
import { FleetSummary } from './components/FleetSummary';
import { SourceAlerts } from './components/SourceAlerts';
import { useAccounts } from './hooks/useAccounts';
import { useCharts } from './hooks/useCharts';

/**
 * The whole fleet on one screen. A line of figures for the fleet; a band
 * with, for each provider, how much of its main usage window is used in
 * total and when it resets, and with a broker the traffic through the
 * gateway as it happens; then every account on a row of its own, its windows
 * read against their clocks as meters and a runway, in the order the gateway
 * picks them unless another order is picked.
 */
export function AccountsPage(): JSX.Element {
  const now = useNow();
  const config = useConfig();
  const accounts = useAccounts();
  const charts = useCharts(now);
  const traffic = useTraffic();
  const controls = config.data?.controls ?? false;
  const list = accounts.data;
  const [order, setOrder] = useState<AccountOrder>('priority');
  const pools = list ? headlinePools(poolLimits(list.accounts, now)) : [];
  const views = list ? list.accounts.map(account => viewAccount(account, charts.trends, now)) : [];
  const fleet = fleetOf(views);
  const priorities = list ? gatewayPriority(list.accounts, now) : new Map<string, Priority>();

  return (
    <section className="flex flex-col gap-2">
      <h1 className="sr-only">Accounts</h1>
      <PageHeader>{list && <FleetSummary fleet={fleet} updatedAt={list.gateway.updatedAt} now={now} />}</PageHeader>

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

          <FleetBand
            pools={pools}
            traffic={traffic.data}
            trafficStatus={traffic.isPending ? 'pending' : traffic.data ? 'success' : 'error'}
            monthlyUsd={fleet.monthlyUsd}
            now={now}
          />

          {list.accounts.length === 0 ? (
            <p className="px-1 text-caption text-muted">The gateway reports no accounts.</p>
          ) : (
            <section aria-label="Every account" className="flex flex-col gap-2">
              <AccountsToolbar count={views.length} order={order} onOrder={setOrder} />
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                {orderAccounts(views, order, priorities).map(view => (
                  <AccountRow
                    key={view.account.id}
                    account={view.account}
                    trends={charts.trends}
                    start={charts.since}
                    now={now}
                    controls={controls}
                    priority={priorities.get(view.account.id)}
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
