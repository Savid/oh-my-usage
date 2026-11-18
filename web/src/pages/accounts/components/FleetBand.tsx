import type { JSX } from 'react';
import clsx from 'clsx';
import { LiveTraffic } from './LiveTraffic';
import { PoolMeter } from './PoolMeter';
import type { FleetBandProps } from './FleetBand.types';

/**
 * The top of the page in one band: on the left, how much of each provider's
 * main window is used across its accounts; on the right, with a broker, the
 * traffic through the gateway as it happens. Without a broker the totals
 * have the band to themselves.
 */
export function FleetBand({ pools, traffic, trafficStatus, monthlyUsd, now }: FleetBandProps): JSX.Element | null {
  // Without a broker there is no traffic to read, and nothing is said about it.
  const hasTraffic = trafficStatus !== 'success' || traffic?.available === true;
  if (pools.length === 0 && !hasTraffic) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-surface lg:flex-row">
      {pools.length > 0 && (
        <ul
          aria-label="Totals"
          className={clsx(
            'flex flex-col justify-center gap-3 px-4 py-3',
            hasTraffic
              ? 'border-b border-border lg:w-120 lg:shrink-0 lg:border-r lg:border-b-0'
              : 'flex-1 lg:grid lg:grid-cols-2 lg:gap-x-8'
          )}
        >
          {pools.map(pool => (
            <PoolMeter key={pool.provider} pool={pool} now={now} />
          ))}
        </ul>
      )}

      {trafficStatus === 'pending' ? (
        <p role="status" className="flex min-h-36 flex-1 items-center px-4 text-caption text-muted">
          Loading the traffic…
        </p>
      ) : trafficStatus === 'error' && !traffic ? (
        <p role="alert" className="flex min-h-36 flex-1 items-center px-4 text-caption text-danger">
          Could not load the traffic.
        </p>
      ) : (
        traffic?.available && <LiveTraffic traffic={traffic} monthlyUsd={monthlyUsd} now={now} />
      )}
    </div>
  );
}
