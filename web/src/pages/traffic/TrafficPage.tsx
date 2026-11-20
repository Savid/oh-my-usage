import { useState, type JSX } from 'react';
import { Link } from '@tanstack/react-router';
import { TrafficBars } from '@/components/Data/TrafficBars';
import { PageHeader } from '@/components/Layout/PageHeader';
import { Notice } from '@/components/Feedback/Notice';
import { useNow } from '@/hooks/useNow';
import { useTraffic } from '@/hooks/useTraffic';
import { formatDateTime } from '@/lib/format';
import { metricInfo, type Metric } from '@/lib/metrics';
import { LiveTraffic } from '@/components/Data/LiveTraffic';
import { TrafficClients } from './components/TrafficClients';
import { TrafficWindowTile } from './components/TrafficWindowTile';
import type { TrafficPageProps } from './TrafficPage.types';

/** Where the page sits, beside the mark: the accounts it came from, then itself. */
function Trail(): JSX.Element {
  return (
    <div className="flex items-baseline gap-2">
      <Link to="/" className="text-body text-muted underline-offset-4 hover:text-foreground hover:underline">
        Accounts
      </Link>
      <span aria-hidden="true" className="text-body text-muted">
        /
      </span>
      <h1 className="text-body font-semibold">Traffic</h1>
    </div>
  );
}

/**
 * What is passing through the gateway. It opens on the traffic as it
 * happens, large, with the switch that picks what every chart on the page
 * shows: tokens out or in, the share read from a cache, the cost at API
 * prices or requests. Then the last hour, day and week in one band, the
 * last hour by minute and the week by hour, and who sent it.
 */
export function TrafficPage({ metric: chosen, onMetric }: TrafficPageProps): JSX.Element {
  const now = useNow();
  const traffic = useTraffic();
  const [own, setOwn] = useState<Metric>('output');
  const metric = chosen ?? own;
  const setMetric = onMetric ?? setOwn;
  const data = traffic.data;

  if (traffic.isPending || !data || !data.available) {
    return (
      <section className="flex flex-col gap-2">
        <PageHeader>
          <Trail />
        </PageHeader>
        {traffic.isPending ? (
          <p role="status" className="px-1 text-caption text-muted">
            Loading the traffic…
          </p>
        ) : !data ? (
          <Notice tone="danger" title="Could not reach oh-my-usage">
            The traffic shows once it answers.
          </Notice>
        ) : (
          <p className="px-1 text-caption text-muted">
            Traffic is read from the omp auth broker, and none is configured. Start oh-my-usage with a broker URL and
            token to see it.
          </p>
        )}
      </section>
    );
  }

  const measuredFrom = data.measuredSince === undefined ? undefined : Date.parse(data.measuredSince);
  // The estimate only shows while the week drawn reaches back before the first reading.
  const estimated = measuredFrom !== undefined && measuredFrom > Date.parse(data.hours.start);
  const { title } = metricInfo(metric);

  return (
    <section className="flex flex-col gap-2">
      <PageHeader>
        <Trail />
      </PageHeader>

      {traffic.isError && <Notice title="Lost contact with oh-my-usage">Showing the last traffic it sent.</Notice>}

      {/* The live panel says itself when the broker is down. */}
      <LiveTraffic traffic={data} now={now} variant="page" metric={metric} onMetric={setMetric} />

      <section
        aria-label="Totals"
        className="grid divide-y divide-border overflow-hidden rounded-md border border-border bg-surface lg:grid-cols-3 lg:divide-x lg:divide-y-0"
      >
        {data.windows.map(window => (
          <TrafficWindowTile key={window.id} window={window} />
        ))}
      </section>

      <div className="flex flex-col gap-2">
        <section
          aria-labelledby="minutes-heading"
          className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-3"
        >
          <h2 id="minutes-heading" className="text-micro font-semibold tracking-caps text-muted uppercase">
            Last hour, by minute
          </h2>
          <TrafficBars series={data.minutes} metric={metric} label={`${title} by minute, last hour`} />
        </section>

        <section
          aria-labelledby="hours-heading"
          className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-3"
        >
          <h2 id="hours-heading" className="text-micro font-semibold tracking-caps text-muted uppercase">
            Last 7 days, by hour
          </h2>
          <TrafficBars
            series={data.hours}
            metric={metric}
            label={`${title} by hour, last 7 days`}
            measuredSince={data.measuredSince}
          />
          {estimated && (
            <p className="text-micro text-muted">
              Measured since {formatDateTime(measuredFrom)}. Before that the broker only kept each burst of traffic as
              one entry, so a burst is drawn in the hour it ended.
            </p>
          )}
        </section>
      </div>

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
