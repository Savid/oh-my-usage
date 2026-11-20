import type { JSX } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UsageSample } from '@/api';
import { getAccountHistoryOptions } from '@/api/@tanstack/react-query.gen';
import { Notice } from '@/components/Feedback/Notice';
import { PageHeader } from '@/components/Layout/PageHeader';
import { Panel } from '@/components/Layout/Panel';
import { useConfig } from '@/hooks/useConfig';
import { useNow } from '@/hooks/useNow';
import { providerName } from '@/lib/accounts';
import { gatewayPriority } from '@/lib/priority';
import type { AccountPageProps } from './AccountPage.types';
import { AccountFacts } from './components/AccountFacts';
import { AccountSummary } from './components/AccountSummary';
import { SavedResets } from './components/SavedResets';
import { SourceAlerts } from './components/SourceAlerts';
import { UsageHistoryChart } from './components/UsageHistoryChart';
import { useAccounts } from './hooks/useAccounts';
import { chartsSince } from './hooks/useCharts';

const NO_SAMPLES: readonly UsageSample[] = [];

/**
 * One account in full, opening on a band as the homepage does. On its left,
 * under the mark: who it is, where the gateway would pick it, whether it takes
 * traffic and the button that pauses it, then each usage window on a line
 * with where it is heading. On its right, what it used over the last seven
 * days. Under the band, the resets it has saved and what it is.
 */
export function AccountPage({ accountId }: AccountPageProps): JSX.Element {
  const now = useNow();
  const config = useConfig();
  const accounts = useAccounts();

  const history = useQuery({
    ...getAccountHistoryOptions({ path: { accountId }, query: { since: new Date(chartsSince(now)).toISOString() } }),
    // Keep the drawn period on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  const list = accounts.data;
  const account = list?.accounts.find(candidate => candidate.id === accountId);
  const samples = history.data?.samples ?? NO_SAMPLES;
  const heading = (
    <h2 id="history-heading" className="text-body font-semibold tracking-caps uppercase">
      Quota used · 7 days
    </h2>
  );

  return (
    <section className="flex flex-col gap-2">
      <Panel hairline="strong">
        <div className="flex flex-col lg:flex-row">
          <div className="flex flex-col gap-3 border-b border-border px-4 pt-1.5 pb-4 lg:w-120 lg:shrink-0 lg:border-r lg:border-b-0">
            <PageHeader title={account ? providerName(account.provider) : 'Account'} />
            {accounts.isPending ? (
              <p role="status" className="text-caption text-muted">
                Loading the account…
              </p>
            ) : account ? (
              <AccountSummary
                account={account}
                priority={list ? gatewayPriority(list.accounts, now).get(account.id) : undefined}
                controls={config.data?.controls ?? false}
                samples={samples}
                now={now}
              />
            ) : (
              list && <p className="text-caption text-muted">The gateway no longer reports this account.</p>
            )}
          </div>

          <section aria-labelledby="history-heading" className="flex min-w-0 flex-1 flex-col gap-2 py-3">
            {history.isPending || !history.data ? (
              <>
                <div className="px-4">{heading}</div>
                {history.isPending ? (
                  <p role="status" className="flex min-h-40 flex-1 items-center px-4 text-caption text-muted">
                    Loading the usage history…
                  </p>
                ) : (
                  <p role="alert" className="flex min-h-40 flex-1 items-center px-4 text-caption text-danger">
                    Could not load the usage history.
                  </p>
                )}
              </>
            ) : (
              <>
                <UsageHistoryChart
                  samples={history.data.samples}
                  provider={account?.provider}
                  limits={account?.limits}
                  heading={heading}
                />
                {history.isError && (
                  <p role="alert" className="px-4 text-caption text-warn">
                    <span aria-hidden="true">▲ </span>
                    Could not refresh the usage history: this is the last period that loaded.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </Panel>

      {!accounts.isPending && !list && (
        <Notice tone="danger" title="Could not reach oh-my-usage">
          The account shows once it answers.
        </Notice>
      )}
      {list && <SourceAlerts list={list} stale={accounts.isError} now={now} />}

      {account && (
        <div className="grid items-start gap-2 lg:grid-cols-2">
          <SavedResets resets={account.resets} limits={account.limits} now={now} />
          <AccountFacts account={account} now={now} />
        </div>
      )}
    </section>
  );
}
