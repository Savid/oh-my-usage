import type { JSX } from 'react';
import clsx from 'clsx';
import { LiveTraffic } from '@/components/Data/LiveTraffic';
import { PageHeader } from '@/components/Layout/PageHeader';
import { PoolMeter } from './PoolMeter';
import type { FleetBandProps } from './FleetBand.types';

/**
 * The top of the page in one band. On the left, under the product's mark,
 * how much of each provider's main window is used across its accounts;
 * on the right, with a broker, the traffic through the gateway as it happens.
 * Without a broker the left has the band to itself. A hairline in the mark's
 * gradient runs along its top.
 */
export function FleetBand({ pools, traffic, trafficStatus, monthlyUsd, now }: FleetBandProps): JSX.Element {
  // Without a broker there is no traffic to read, and nothing is said about it.
  const hasTraffic = trafficStatus !== 'success' || traffic?.available === true;

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-surface">
      <div aria-hidden="true" className="h-0.5 bg-linear-to-r from-mark-magenta via-mark-iris to-mark-cyan" />
      <div className="flex flex-col lg:flex-row">
        <div
          className={clsx(
            'flex flex-col gap-3 px-4 pt-1.5 pb-3',
            hasTraffic ? 'border-b border-border lg:w-120 lg:shrink-0 lg:border-r lg:border-b-0' : 'flex-1'
          )}
        >
          <PageHeader />
          {pools.length > 0 && (
            <ul
              aria-label="Totals"
              className={clsx(
                'flex flex-1 flex-col justify-center gap-3',
                !hasTraffic && 'lg:grid lg:grid-cols-2 lg:gap-x-8'
              )}
            >
              {pools.map(pool => (
                <PoolMeter key={pool.provider} pool={pool} now={now} />
              ))}
            </ul>
          )}
        </div>

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
    </div>
  );
}
