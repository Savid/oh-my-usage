import type { JSX } from 'react';
import { Link } from '@tanstack/react-router';
import type { TrafficWindow } from '@/api';
import { TrafficBars } from '@/components/Data/TrafficBars';
import { formatCount, formatShort, formatUsd } from '@/lib/format';
import { tokensOf } from '@/lib/traffic';
import type { TrafficBandProps } from './TrafficBand.types';

/** Traffic older than this is called out: readings come every few seconds. */
const STALE_MS = 2 * 60_000;

const windowNames: Record<TrafficWindow['id'], string> = { hour: 'last hour', day: '24 hours', week: '7 days' };

function volume(window: TrafficWindow): string {
  return `${formatCount(window.total.requests)} req · ${formatCount(tokensOf(window.total))} tok`;
}

/**
 * What is passing through the gateway right now, as one band: the last
 * hour's cost at API prices as the large figure, the day and the week under
 * it, and beside them the last hour minute by minute.
 */
export function TrafficBand({ traffic, now }: TrafficBandProps): JSX.Element {
  const hour = traffic.windows.find(window => window.id === 'hour');
  const longer = traffic.windows.filter(window => window.id !== 'hour');
  const age = traffic.updatedAt === undefined ? undefined : now - Date.parse(traffic.updatedAt);

  return (
    <section
      aria-labelledby="traffic-heading"
      className="overflow-hidden rounded-md border border-border bg-surface lg:flex"
    >
      <div className="flex flex-col justify-center gap-1 px-4 py-3 lg:w-96 lg:shrink-0 lg:border-r lg:border-border">
        <div className="flex items-baseline gap-2">
          <h2 id="traffic-heading" className="text-body font-semibold tracking-caps uppercase">
            <Link to="/traffic" className="underline-offset-4 hover:underline">
              Traffic
            </Link>
          </h2>
          {!traffic.error && (
            <span className="ml-auto text-micro text-muted">
              {age === undefined
                ? 'waiting for the first reading'
                : age > STALE_MS
                  ? `last read ${formatShort(age)} ago`
                  : `read ${formatShort(age)} ago`}
            </span>
          )}
        </div>

        {traffic.error && (
          <p role="alert" className="text-caption text-danger">
            The broker is not answering, so this is not current
            {age !== undefined && `: last read ${formatShort(age)} ago`}. {traffic.error}
          </p>
        )}

        {hour && (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-display font-semibold tabular-nums">{formatUsd(hour.total.costUsd)}</span>
            <span className="text-caption text-muted">last hour, at API prices</span>
          </p>
        )}

        <dl className="flex flex-col text-caption">
          {hour && (
            <div>
              <dt className="sr-only">Last hour</dt>
              <dd className="text-muted tabular-nums">{volume(hour)}</dd>
            </div>
          )}
          {longer.map(window => (
            <div key={window.id} className="flex items-baseline gap-3">
              <dt className="w-16 shrink-0 text-micro tracking-caps text-muted uppercase">{windowNames[window.id]}</dt>
              <dd className="tabular-nums">
                <span className="font-semibold">{formatUsd(window.total.costUsd)}</span>
                <span className="text-muted"> · {volume(window)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="min-w-0 flex-1 px-4 py-3">
        <TrafficBars series={traffic.minutes} size="band" label="Cost at API prices by minute, last hour" />
      </div>
    </section>
  );
}
