import { useState, type JSX } from 'react';
import { TrafficBars } from '@/components/Data/TrafficBars';
import { PageHeader } from '@/components/Layout/PageHeader';
import { Panel } from '@/components/Layout/Panel';
import { Notice } from '@/components/Feedback/Notice';
import { useNow } from '@/hooks/useNow';
import { useTraffic } from '@/hooks/useTraffic';
import { formatDateTime } from '@/lib/format';
import { metricInfo, type Metric } from '@/lib/metrics';
import { LiveTraffic } from '@/components/Data/LiveTraffic';
import { TrafficClients } from './components/TrafficClients';
import { TrafficWindowTile } from './components/TrafficWindowTile';
import type { TrafficPageProps } from './TrafficPage.types';

/**
 * What is passing through the gateway. It opens on a band, as the homepage
 * does: under the mark, the traffic as it happens, large, with the switch that
 * picks what every chart on the page shows: tokens out or in, the share read
 * from a cache, the cost at API prices or requests. Then, each on a panel, the
 * last hour, day and week, the last hour by minute and the week by hour, and
 * who sent it.
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
        <Panel hairline="strong">
          <div className="flex flex-col gap-3 px-4 pt-1.5 pb-4">
            <PageHeader title="Traffic" />
            {traffic.isPending ? (
              <p role="status" className="text-caption text-muted">
                Loading the traffic…
              </p>
            ) : (
              data && (
                <p className="text-caption text-muted">
                  Traffic is read from the omp auth broker, and none is configured. Start oh-my-usage with a broker URL
                  and token to see it.
                </p>
              )
            )}
          </div>
        </Panel>
        {!traffic.isPending && !data && (
          <Notice tone="danger" title="Could not reach oh-my-usage">
            The traffic shows once it answers.
          </Notice>
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
      <Panel hairline="strong">
        <div className="px-4 pt-1.5">
          <PageHeader title="Traffic" />
        </div>
        {/* The live panel says itself when the broker is down. */}
        <LiveTraffic traffic={data} now={now} variant="page" metric={metric} onMetric={setMetric} />
      </Panel>

      {traffic.isError && <Notice title="Lost contact with oh-my-usage">Showing the last traffic it sent.</Notice>}

      <Panel title="Totals">
        <div className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {data.windows.map(window => (
            <TrafficWindowTile key={window.id} window={window} />
          ))}
        </div>
      </Panel>

      <Panel title="By minute" aside="last hour" label="Last hour, by minute">
        <div className="px-4 py-3">
          <TrafficBars series={data.minutes} metric={metric} label={`${title} by minute, last hour`} />
        </div>
      </Panel>

      <Panel title="By hour" aside="last 7 days" label="Last 7 days, by hour">
        <div className="flex flex-col gap-2 px-4 py-3">
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
        </div>
      </Panel>

      <Panel title="Clients" count={data.clients.length} aside="last 7 days" label="Clients, last 7 days">
        <div className="px-4 py-3">
          <TrafficClients clients={data.clients} />
        </div>
      </Panel>
    </section>
  );
}
