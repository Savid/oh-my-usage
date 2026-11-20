import type { JSX, ReactNode } from 'react';
import { Panel } from '@/components/Layout/Panel';
import { providerName } from '@/lib/accounts';
import { formatClock, formatPrice, formatShort } from '@/lib/format';
import type { AccountFactsProps } from './AccountFacts.types';

/** Usage older than this is called out: the provider has not answered for a while. */
const STALE_MS = 15 * 60_000;

const kinds: Record<string, string> = { oauth: 'OAuth login', api_key: 'API key' };

function Fact({ name, children }: { name: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline gap-3 px-4 py-2">
      <dt className="w-28 shrink-0 text-micro tracking-caps text-muted uppercase">{name}</dt>
      <dd className="min-w-0 flex-1 text-caption">{children}</dd>
    </div>
  );
}

/**
 * What an account is, beyond its name: the blocks omp has on it, its
 * provider, how it is logged in, whose it is, what it costs and how old its
 * usage figures are. Whether it takes traffic is said at the top of the page.
 */
export function AccountFacts({ account, now }: AccountFactsProps): JSX.Element {
  const blocks = account.blocks.filter(block => Date.parse(block.until) > now);
  const reported = account.fetchedAt === undefined ? undefined : now - Date.parse(account.fetchedAt);

  return (
    <Panel title="Details">
      <dl className="flex flex-col divide-y divide-border">
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
        {account.monthlyUsd !== undefined && <Fact name="Price">{formatPrice(account.monthlyUsd)} a month</Fact>}
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
    </Panel>
  );
}
