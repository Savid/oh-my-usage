import type { JSX } from 'react';
import { TrafficBars } from '@/components/Data/TrafficBars';
import { useNow } from '@/hooks/useNow';
import { useTraffic } from '@/hooks/useTraffic';
import { formatDateTime, formatShort } from '@/lib/format';
import { TrafficClients } from './components/TrafficClients';
import { TrafficWindowTile } from './components/TrafficWindowTile';

/**
 * What is passing through the gateway: the last hour, day and week in total
 * and by provider, the last hour by minute, the week by hour, and who sent it.
 */
export function TrafficPage(): JSX.Element {
  const now = useNow();
  const traffic = useTraffic();
  const data = traffic.data;

  if (traffic.isPending) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="sr-only">Traffic</h1>
        <p role="status" className="px-1 text-caption text-muted">
          Loading the traffic…
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="sr-only">Traffic</h1>
        <p role="alert" className="px-1 text-caption text-danger">
          Could not reach oh-my-usage.
        </p>
      </section>
    );
  }

  if (!data.available) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="sr-only">Traffic</h1>
        <p className="px-1 text-caption text-muted">
          Traffic is read from the omp auth broker, and none is configured. Start oh-my-usage with a broker URL and
          token to see it.
        </p>
      </section>
    );
  }

  const age = data.updatedAt === undefined ? undefined : now - Date.parse(data.updatedAt);
  const measuredFrom = data.measuredSince === undefined ? undefined : Date.parse(data.measuredSince);
  // The estimate only shows while the week drawn reaches back before the first reading.
  const estimated = measuredFrom !== undefined && measuredFrom > Date.parse(data.hours.start);

  return (
    <section className="flex flex-col gap-2">
      <h1 className="sr-only">Traffic</h1>

      {traffic.isError && (
        <p role="alert" className="px-1 text-caption text-danger">
          oh-my-usage is not answering. This is the last traffic it sent.
        </p>
      )}
      {data.error && (
        <p role="alert" className="px-1 text-caption text-danger">
          The broker is not answering, so this is not current
          {age !== undefined && `: last read ${formatShort(age)} ago`}. {data.error}
        </p>
      )}

      <section aria-label="Totals" className="flex flex-wrap gap-2">
        {data.windows.map(window => (
          <TrafficWindowTile key={window.id} window={window} />
        ))}
      </section>

      <section
        aria-labelledby="minutes-heading"
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
      >
        <h2 id="minutes-heading" className="text-micro font-semibold tracking-caps text-muted uppercase">
          Last hour, by minute
        </h2>
        <TrafficBars series={data.minutes} label="Cost at API prices by minute, last hour" />
      </section>

      <section
        aria-labelledby="hours-heading"
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
      >
        <h2 id="hours-heading" className="text-micro font-semibold tracking-caps text-muted uppercase">
          Last 7 days, by hour
        </h2>
        <TrafficBars
          series={data.hours}
          label="Cost at API prices by hour, last 7 days"
          measuredSince={data.measuredSince}
        />
        {estimated && (
          <p className="text-micro text-muted">
            Measured since {formatDateTime(measuredFrom)}. Before that the broker only kept each burst of traffic as one
            entry, so a burst is drawn in the hour it ended.
          </p>
        )}
      </section>

      <section
        aria-labelledby="clients-heading"
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
      >
        <h2 id="clients-heading" className="text-micro font-semibold tracking-caps text-muted uppercase">
          Clients, last 7 days
        </h2>
        <TrafficClients clients={data.clients} />
      </section>
    </section>
  );
}
