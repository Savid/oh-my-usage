import type { JSX } from 'react';
import clsx from 'clsx';
import { formatPrice, formatShort } from '@/lib/format';
import type { FleetSummaryProps } from './FleetSummary.types';

interface Fact {
  key: string;
  value: string;
  name: string;
  /** A mark that goes with an alarming fact, so it does not rest on colour. */
  mark?: string;
  alarm?: boolean;
}

/**
 * The fleet in one line: how many accounts, how many are burning, idle,
 * paused, running dry or spent, what they cost a month and how many saved
 * resets can be spent, and when the gateway was last read. Counts of nothing
 * are left out, except the accounts.
 */
export function FleetSummary({ fleet, updatedAt, now }: FleetSummaryProps): JSX.Element {
  const facts: Fact[] = [
    { key: 'accounts', value: String(fleet.accounts), name: fleet.accounts === 1 ? 'account' : 'accounts' },
  ];
  if (fleet.burning > 0) facts.push({ key: 'burning', value: String(fleet.burning), name: 'burning', mark: '▴' });
  if (fleet.idle > 0) facts.push({ key: 'idle', value: String(fleet.idle), name: 'idle', mark: '○' });
  if (fleet.paused > 0) facts.push({ key: 'paused', value: String(fleet.paused), name: 'paused' });
  if (fleet.dry > 0) {
    facts.push({ key: 'dry', value: String(fleet.dry), name: 'running dry', mark: '▲', alarm: true });
  }
  if (fleet.spent > 0) facts.push({ key: 'spent', value: String(fleet.spent), name: 'spent', mark: '■', alarm: true });
  if (fleet.monthlyUsd !== undefined) {
    facts.push({
      key: 'cost',
      value: `${formatPrice(fleet.monthlyUsd)}/mo`,
      name: fleet.priced === fleet.accounts ? 'in all' : `for ${fleet.priced} priced`,
    });
  }
  if (fleet.resetsUsable > 0) {
    facts.push({
      key: 'resets',
      value: String(fleet.resetsUsable),
      name: fleet.resetsUsable === 1 ? 'reset to spend' : 'resets to spend',
    });
  }

  return (
    <section aria-label="Fleet" className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1 text-caption">
      <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {facts.map(fact => (
          // The name is listed first for assistive technology and drawn after the figure.
          <div
            key={fact.key}
            className={clsx(
              'flex flex-row-reverse items-baseline justify-end gap-1',
              fact.alarm ? 'text-danger' : 'text-muted'
            )}
          >
            <dt>{fact.name}</dt>
            <dd className={clsx('font-semibold tabular-nums', !fact.alarm && 'text-foreground')}>
              {fact.mark && (
                <span aria-hidden="true" className="mr-1 font-medium">
                  {fact.mark}
                </span>
              )}
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
      <span className="ml-auto text-micro text-muted">
        {updatedAt === undefined
          ? 'gateway not read yet'
          : `gateway read ${formatShort(now - Date.parse(updatedAt))} ago`}
      </span>
    </section>
  );
}
