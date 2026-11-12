import type { JSX } from 'react';
import { useConfig } from '@/hooks/useConfig';
import { useNow } from '@/hooks/useNow';
import { groupByProvider, providerName } from '@/lib/accounts';
import { AccountCard } from './components/AccountCard';
import { SourceAlerts } from './components/SourceAlerts';
import { useAccounts } from './hooks/useAccounts';

/** Every account the gateway serves, grouped by provider, with its usage. */
export function AccountsPage(): JSX.Element {
  const now = useNow();
  const config = useConfig();
  const accounts = useAccounts();
  const controls = config.data?.controls ?? false;

  return (
    <section className="mx-auto flex max-w-page flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading font-semibold">Accounts</h1>
        {accounts.data?.gatewayVersion && (
          <p className="text-caption text-muted">omp gateway {accounts.data.gatewayVersion}</p>
        )}
      </div>

      {accounts.isPending ? (
        <p role="status" className="text-body text-muted">
          Loading the accounts…
        </p>
      ) : !accounts.data ? (
        <p role="alert" className="text-body text-danger">
          Could not reach oh-my-usage.
        </p>
      ) : (
        <>
          <SourceAlerts list={accounts.data} stale={accounts.isError} now={now} />

          {accounts.data.accounts.length === 0 ? (
            <p className="text-body text-muted">The gateway reports no accounts.</p>
          ) : (
            groupByProvider(accounts.data.accounts).map(group => (
              <section
                key={group.provider}
                aria-labelledby={`provider-${group.provider}`}
                className="flex flex-col gap-3"
              >
                <h2 id={`provider-${group.provider}`} className="text-title font-semibold">
                  {providerName(group.provider)}
                </h2>
                {group.accounts.map(account => (
                  <AccountCard key={account.id} account={account} now={now} controls={controls} />
                ))}
              </section>
            ))
          )}

          {controls && accounts.data.accounts.length > 0 && (
            <p className="text-caption text-muted">
              A paused account is used last, not never: omp still falls back to it when every other account of its
              provider is blocked or out of quota.
            </p>
          )}
        </>
      )}
    </section>
  );
}
