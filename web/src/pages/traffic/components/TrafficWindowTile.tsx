import type { JSX } from 'react';
import type { TrafficWindow } from '@/api';
import { ProviderIcon } from '@/components/Data/ProviderIcon';
import { providerName } from '@/lib/accounts';
import { formatCount, formatShare, formatUsd } from '@/lib/format';
import { providerTone } from '@/lib/providerTones';
import { tokensOf } from '@/lib/traffic';
import type { TrafficWindowTileProps } from './TrafficWindowTile.types';

const titles: Record<TrafficWindow['id'], string> = { hour: 'Last hour', day: '24 hours', week: '7 days' };

/** How many providers a tile lists; the rest are summed into one line. */
const LISTED = 4;

/**
 * One period's traffic: its cost at API prices as the large figure, how many
 * requests and tokens that was, and how the cost divides between providers,
 * as a bar in their colours and a line each.
 */
export function TrafficWindowTile({ window }: TrafficWindowTileProps): JSX.Element {
  const { total, providers } = window;
  const listed = providers.slice(0, LISTED);
  const rest = providers.slice(LISTED);
  const restCost = rest.reduce((sum, entry) => sum + entry.counts.costUsd, 0);
  let offset = 0;

  return (
    <article
      aria-label={titles[window.id]}
      className="flex min-w-72 flex-1 flex-col gap-2 rounded-md border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-body font-semibold tracking-caps uppercase">{titles[window.id]}</span>
        <span className="ml-auto text-caption text-muted">at API prices</span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-display font-semibold tabular-nums">{formatUsd(total.costUsd)}</span>
        <span className="ml-auto text-caption whitespace-nowrap text-muted tabular-nums">
          {formatCount(total.requests)} req · {formatCount(tokensOf(total))} tok
        </span>
      </div>

      {/* How the cost divides between providers, each in its colour. */}
      <div className="h-1.5 overflow-hidden rounded-sm">
        <svg aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none" className="block size-full">
          <rect width="100" height="1" className="fill-raised" />
          {total.costUsd > 0 &&
            providers.map(entry => {
              const width = (entry.counts.costUsd / total.costUsd) * 100;
              const x = offset;
              offset += width;
              return (
                <rect
                  key={entry.provider}
                  x={x}
                  width={width}
                  height="1"
                  className={providerTone(entry.provider).fill}
                />
              );
            })}
        </svg>
      </div>

      {providers.length === 0 ? (
        <p className="text-caption text-muted">Nothing passed.</p>
      ) : (
        <ul className="flex flex-col text-caption">
          {listed.map(entry => (
            <li key={entry.provider} className="flex items-center gap-2">
              <ProviderIcon provider={entry.provider} decorative />
              <span className="min-w-0 truncate">{providerName(entry.provider)}</span>
              <span className="ml-auto shrink-0 text-muted tabular-nums">{formatCount(entry.counts.requests)} req</span>
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums">
                {formatUsd(entry.counts.costUsd)}
              </span>
              <span className="w-10 shrink-0 text-right text-muted tabular-nums">
                {formatShare(entry.counts.costUsd, total.costUsd)}
              </span>
            </li>
          ))}
          {rest.length > 0 && (
            <li className="flex items-center gap-2 text-muted">
              <span>
                {rest.length} more {rest.length === 1 ? 'provider' : 'providers'}
              </span>
              <span className="ml-auto tabular-nums">{formatUsd(restCost)}</span>
            </li>
          )}
        </ul>
      )}
    </article>
  );
}
