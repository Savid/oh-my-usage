import type { JSX } from 'react';
import clsx from 'clsx';
import type { Account } from '@/api';
import { ProviderIcon } from '@/components/Data/ProviderIcon';
import { StatusBadge } from '@/components/Feedback/StatusBadge';
import type { StatusTone } from '@/components/Feedback/StatusBadge/StatusBadge.types';
import { accountTitle, primaryLimit } from '@/lib/accounts';
import { formatShort } from '@/lib/format';
import { usePause } from '@/pages/accounts/hooks/usePause';
import type { AccountSummaryProps } from './AccountSummary.types';
import { PriorityPill } from './PriorityPill';
import { WindowMeter } from './WindowMeter';

/** Whether the account takes traffic, in a word and a sentence: paused wins, then omp's own block. */
function state(account: Account, now: number): { tone: StatusTone; label: string; detail: string } {
  if (account.paused) {
    return { tone: 'warn', label: 'paused', detail: 'omp uses it last, when every other account is blocked or spent.' };
  }
  if (account.blockedUntil && Date.parse(account.blockedUntil) > now) {
    return {
      tone: 'danger',
      label: `blocked ${formatShort(Date.parse(account.blockedUntil) - now)}`,
      detail: 'omp sends it nothing until the block clears.',
    };
  }
  return { tone: 'ok', label: 'active', detail: 'omp may send it traffic.' };
}

/**
 * The account at the top of its page, under the mark: who it is, where the
 * gateway would pick it, whether it takes traffic and the button that pauses
 * it; then every usage window on a line of its own, the main one first, each
 * with where it is heading.
 */
export function AccountSummary({ account, priority, controls, samples, now }: AccountSummaryProps): JSX.Element {
  const pause = usePause(account);
  const { paused } = pause;
  const { tone, label, detail } = state({ ...account, paused }, now);
  const main = primaryLimit(account.limits);
  // The main window first; the rest in the provider's order.
  const limits = main ? [main, ...account.limits.filter(limit => limit !== main)] : account.limits;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="pt-1">
          <ProviderIcon provider={account.provider} size="md" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 truncate text-title font-semibold">{accountTitle(account)}</h2>
            {priority && <PriorityPill priority={priority} />}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted">
            <StatusBadge tone={tone}>{label}</StatusBadge>
            <span>{detail}</span>
          </p>
        </div>
        {controls && account.pausable && (
          <button
            type="button"
            disabled={pause.pending}
            onClick={pause.toggle}
            title={paused ? 'Resume: let omp send it traffic' : "Pause: move omp's traffic off it"}
            className={clsx(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-micro tracking-caps uppercase transition-colors disabled:cursor-wait',
              paused
                ? 'border-warn text-warn hover:bg-raised'
                : 'border-border text-muted hover:border-border-strong hover:text-foreground'
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 12 12" className="size-2.5 fill-current">
              {paused ? (
                <path d="M3.5 1.75v8.5L10.5 6z" />
              ) : (
                <>
                  <rect x="2.5" y="1.5" width="2.5" height="9" rx="0.75" />
                  <rect x="7" y="1.5" width="2.5" height="9" rx="0.75" />
                </>
              )}
            </svg>
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
      </div>

      {pause.error && (
        <p role="alert" className="text-caption text-danger">
          {pause.error}
        </p>
      )}

      {limits.length === 0 ? (
        <p className="text-caption text-muted">The provider reports no usage windows for this account.</p>
      ) : (
        <ul aria-label="Usage windows" className="flex flex-col gap-3">
          {limits.map(limit => (
            // Without recorded usage a window's pace is its average since it opened.
            <WindowMeter key={limit.id} limit={limit} provider={account.provider} samples={samples} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
