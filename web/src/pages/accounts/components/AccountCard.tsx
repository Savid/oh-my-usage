import type { JSX } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Account, AccountList } from '@/api';
import { listAccountsQueryKey, setAccountPausedMutation } from '@/api/@tanstack/react-query.gen';
import { StatusBadge } from '@/components/Feedback/StatusBadge';
import type { StatusTone } from '@/components/Feedback/StatusBadge/StatusBadge.types';
import { accountTitle } from '@/lib/accounts';
import { formatAge, formatUntil } from '@/lib/format';
import { problemDetail } from '@/lib/problem';
import type { AccountCardProps } from './AccountCard.types';
import { UsageMeter } from './UsageMeter';

/** The account's state in a word: paused wins, then omp's own block. */
function state(account: Account, now: number): { tone: StatusTone; label: string } {
  if (account.paused) return { tone: 'warn', label: 'paused' };
  if (account.blockedUntil && Date.parse(account.blockedUntil) > now) {
    return { tone: 'danger', label: `blocked for ${formatUntil(account.blockedUntil, now)}` };
  }
  return { tone: 'ok', label: 'active' };
}

/** The line under the title: organisation, plan and kind of credential, as far as they are known. */
function subtitle(account: Account): string {
  const parts: string[] = [];
  if (account.orgName) parts.push(account.orgName);
  if (account.plan) parts.push(`${account.plan} plan`);
  if (account.kind === 'oauth') parts.push('login');
  if (account.kind === 'api_key' && account.email) parts.push('API key');
  return parts.join(' · ');
}

function resetsLine(account: Account, now: number): string | undefined {
  const resets = account.resets;
  if (!resets || resets.available === 0) return undefined;

  const parts = [`${resets.available} saved ${resets.available === 1 ? 'reset' : 'resets'}`];
  if (resets.usable !== undefined) parts.push(`${resets.usable} usable now`);
  if (resets.soonestExpiresAt) parts.push(`first expires in ${formatUntil(resets.soonestExpiresAt, now)}`);
  return parts.join(', ');
}

/**
 * One account: who it is, whether it is taking traffic, its usage windows, and
 * the pause control when a broker is configured.
 */
export function AccountCard({ account, now, controls, headingLevel = 3 }: AccountCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const pause = useMutation({
    ...setAccountPausedMutation(),
    // The answer is the account as the broker now reports it; the event
    // stream sends the same after its next poll.
    onSuccess: updated => {
      queryClient.setQueryData(listAccountsQueryKey(), (list: AccountList | undefined) =>
        list ? { ...list, accounts: list.accounts.map(entry => (entry.id === updated.id ? updated : entry)) } : list
      );
    },
  });

  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const headingId = `account-${account.id}`;
  const { tone, label } = state(account, now);
  const about = subtitle(account);
  const resets = resetsLine(account, now);

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Heading id={headingId} className="truncate text-title font-semibold">
            <Link
              to="/accounts/$accountId"
              params={{ accountId: account.id }}
              className="underline-offset-4 hover:underline"
            >
              {accountTitle(account)}
            </Link>
          </Heading>
          {about && <p className="text-caption text-muted">{about}</p>}
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge tone={tone}>{label}</StatusBadge>
          {controls && account.pausable && (
            <button
              type="button"
              disabled={pause.isPending}
              onClick={() => pause.mutate({ path: { accountId: account.id }, body: { paused: !account.paused } })}
              className="rounded-sm border border-border-strong px-3 py-1 text-body hover:bg-background disabled:text-muted"
            >
              {account.paused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      </header>

      {pause.isError && (
        <p role="alert" className="text-body text-danger">
          {account.paused ? 'Could not resume the account' : 'Could not pause the account'}:{' '}
          {problemDetail(pause.error, 'the server did not answer')}
        </p>
      )}

      {account.limits.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {account.limits.map(limit => (
            <li key={limit.id}>
              <UsageMeter limit={limit} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-muted">No usage is reported for this account.</p>
      )}

      {(resets ?? account.fetchedAt) && (
        <footer className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-caption text-muted">
          <span>{resets}</span>
          {account.fetchedAt && <span>Usage read {formatAge(account.fetchedAt, now)} ago</span>}
        </footer>
      )}
    </article>
  );
}
