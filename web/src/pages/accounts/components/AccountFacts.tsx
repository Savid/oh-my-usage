import type { JSX, ReactNode } from 'react';
import { StatusBadge } from '@/components/Feedback/StatusBadge';
import type { StatusTone } from '@/components/Feedback/StatusBadge/StatusBadge.types';
import { providerName } from '@/lib/accounts';
import { formatClock, formatShort } from '@/lib/format';
import type { AccountFactsProps } from './AccountFacts.types';

/** Usage older than this is called out: the provider has not answered for a while. */
const STALE_MS = 15 * 60_000;

const kinds: Record<string, string> = { oauth: 'OAuth login', api_key: 'API key' };

function Fact({ name, children }: { name: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline gap-3 py-1 first:pt-0 last:pb-0">
      <dt className="w-28 shrink-0 text-micro tracking-caps text-muted uppercase">{name}</dt>
      <dd className="min-w-0 flex-1 text-caption">{children}</dd>
    </div>
  );
}

/**
 * Whether an account is taking traffic and why not, then what it is: the
 * blocks omp has on it, how it is logged in, whose it is, and how old its
 * usage figures are.
 */
export function AccountFacts({ account, now }: AccountFactsProps): JSX.Element {
  const blocks = account.blocks.filter(block => Date.parse(block.until) > now);
  const reported = account.fetchedAt === undefined ? undefined : now - Date.parse(account.fetchedAt);

  let state: { tone: StatusTone; label: string; detail: string };
  if (account.paused) {
    state = {
      tone: 'warn',
      label: 'paused',
      detail: 'omp uses it last, when every other account is blocked or spent.',
    };
  } else if (blocks.length > 0) {
    state = { tone: 'danger', label: 'blocked', detail: 'omp sends it nothing in the scopes below until they clear.' };
  } else {
    state = { tone: 'ok', label: 'active', detail: 'omp may send it traffic.' };
  }

  return (
    <section
      aria-labelledby="facts-heading"
      className="flex min-w-0 flex-1 flex-col gap-2 rounded-md border border-border bg-surface p-3"
    >
      <h2 id="facts-heading" className="text-micro font-semibold tracking-caps text-muted uppercase">
        Status
      </h2>

      <dl className="flex flex-col divide-y divide-border">
        <Fact name="Traffic">
          <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
          <span className="ml-2 text-muted">{state.detail}</span>
        </Fact>

        {blocks.length > 0 && (
          <Fact name="Blocks">
            <ul className="flex flex-col">
              {blocks.map(block => (
                <li key={`${block.scope} ${block.until}`} className="tabular-nums">
                  <span className="font-medium">{block.scope || 'everything'}</span>
                  <span className="text-muted">
                    {' '}
                    until {formatClock(Date.parse(block.until))}, in {formatShort(Date.parse(block.until) - now)}
                  </span>
                </li>
              ))}
            </ul>
          </Fact>
        )}

        <Fact name="Provider">{providerName(account.provider)}</Fact>
        <Fact name="Login">
          {account.kind === undefined ? (
            <span className="text-muted">Not held by the broker, so it cannot be paused.</span>
          ) : (
            (kinds[account.kind] ?? account.kind)
          )}
        </Fact>
        {account.orgName && <Fact name="Organisation">{account.orgName}</Fact>}
        {account.plan && <Fact name="Plan">{account.plan}</Fact>}
        <Fact name="Usage read">
          {reported === undefined ? (
            <span className="text-muted">The provider has reported no usage.</span>
          ) : reported > STALE_MS ? (
            <span className="text-warn">{formatShort(reported)} ago: the figures above are that old.</span>
          ) : (
            <span className="tabular-nums">{formatShort(reported)} ago</span>
          )}
        </Fact>
      </dl>
    </section>
  );
}
