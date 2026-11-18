import { useState, type JSX, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { TrafficWindow } from '@/api';
import { ProviderIcon } from '@/components/Data/ProviderIcon';
import { RollingNumber } from '@/components/Data/RollingNumber';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { providerName } from '@/lib/accounts';
import { WEEKS_PER_MONTH } from '@/lib/fleet';
import { formatCount, formatPercent, formatShort, formatTime, formatUsd } from '@/lib/format';
import { liveView } from '@/lib/live';
import { cacheShare } from '@/lib/traffic';
import { LiveChart } from './LiveChart';
import type { LiveTrafficProps } from './LiveTraffic.types';

/** Traffic older than this is called out: readings come every few seconds. */
const STALE_MS = 2 * 60_000;

/** How much time the chart shows: ten minutes live, or the last hour until a minute of live points is in. */
const LIVE_SPAN_MS = 10 * 60_000;
const HOUR_SPAN_MS = 60 * 60_000;
const LIVE_MIN_POINTS = 12;

/** How many providers the legend names; the rest are added up. */
const LEGEND_MAX = 3;

/** How long one ring of the live dot's pulse takes. */
const PULSE = '1.6s';

type Status = 'live' | 'stale' | 'down' | 'waiting';

// A word goes with each colour, so the state never rests on colour alone.
const statusClasses: Record<Status, string> = {
  live: 'text-ok',
  stale: 'text-warn',
  down: 'text-danger',
  waiting: 'text-muted',
};

const statusWords: Record<Status, string> = {
  live: 'Live',
  stale: 'Stale',
  down: 'Not current',
  waiting: 'Waiting',
};

function byId(windows: readonly TrafficWindow[], id: TrafficWindow['id']): TrafficWindow | undefined {
  return windows.find(window => window.id === id);
}

/** A small value on a solid chip of its own, so the chart never runs through it. */
function Chip({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <span
      className={clsx(
        'flex h-6 items-center gap-1 rounded-sm border border-border bg-surface px-2 text-micro whitespace-nowrap text-muted tabular-nums',
        className
      )}
    >
      {children}
    </span>
  );
}

/** A figure on a chip, brighter than the words around it. */
function Figure({ children }: { children: ReactNode }): JSX.Element {
  return <span className="font-semibold text-foreground">{children}</span>;
}

/** A dot that sends out a ring now and then while the traffic is live. */
function StatusDot({ pulsing }: { pulsing: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 shrink-0 overflow-visible">
      {pulsing && (
        <circle cx="6" cy="6" r="3" fill="currentColor">
          <animate attributeName="r" values="3;7" dur={PULSE} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0" dur={PULSE} repeatCount="indefinite" />
        </circle>
      )}
      <circle cx="6" cy="6" r="3" fill="currentColor" />
    </svg>
  );
}

/**
 * The gateway's traffic as it happens, drawn edge to edge behind its
 * figures: how many tokens it is generating a second, by provider, over the
 * last ten minutes, gliding left as each reading comes in. Over it, the
 * rate now (or at the point the pointer is on), each provider's share of
 * it, and what the last hour, day and week came to at API prices.
 */
export function LiveTraffic({ traffic, monthlyUsd, now }: LiveTrafficProps): JSX.Element {
  const [scrub, setScrub] = useState<number>();
  const still = usePrefersReducedMotion();

  const live = liveView(traffic.live);
  const warming = live.times.length < LIVE_MIN_POINTS;
  const view = warming ? liveView(traffic.minutes) : live;
  const span = warming ? HOUR_SPAN_MS : LIVE_SPAN_MS;

  const last = view.times.length - 1;
  const shown = scrub !== undefined && scrub <= last ? scrub : last;
  const scrubbing = shown !== last;
  const rate = view.totals[shown] ?? 0;
  const rates = view.layers
    .map(layer => ({ provider: layer.provider, rate: layer.rates[shown] ?? 0 }))
    .sort((one, other) => other.rate - one.rate);
  const named = rates.slice(0, LEGEND_MAX);
  const others = rates.slice(LEGEND_MAX).reduce((sum, entry) => sum + entry.rate, 0);

  const age = traffic.updatedAt === undefined ? undefined : now - Date.parse(traffic.updatedAt);
  const status: Status = traffic.error ? 'down' : age === undefined ? 'waiting' : age > STALE_MS ? 'stale' : 'live';

  const hour = byId(traffic.windows, 'hour');
  const day = byId(traffic.windows, 'day');
  const week = byId(traffic.windows, 'week');
  const weekCost = week?.total.costUsd ?? 0;
  const weekPrice = monthlyUsd === undefined ? undefined : monthlyUsd / WEEKS_PER_MONTH;
  const multiple = weekPrice !== undefined && weekPrice > 0 ? weekCost / weekPrice : undefined;
  const cached = day ? cacheShare(day.total) : undefined;

  return (
    <section aria-labelledby="traffic-heading" className="relative flex min-h-52 min-w-0 flex-1 flex-col lg:min-h-36">
      {/* Before the first reading nothing is known, not even that it is quiet. */}
      {traffic.updatedAt !== undefined && (
        <LiveChart
          view={view}
          span={span}
          scrub={scrub}
          onScrub={setScrub}
          className="absolute inset-x-0 bottom-0 h-32 lg:top-10 lg:h-auto"
        />
      )}

      {/* The figures sit over the chart and let the pointer through to it, all but the link. */}
      <div className="pointer-events-none relative flex flex-1 flex-col gap-1 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="traffic-heading" className="pointer-events-auto text-body font-semibold tracking-caps uppercase">
            <Link to="/traffic" className="underline-offset-4 hover:underline">
              Traffic
            </Link>
          </h2>

          {scrubbing ? (
            <span className="text-micro text-muted tabular-nums">
              {formatTime(view.times[shown] ?? 0)} · {formatShort((view.times[last] ?? 0) - (view.times[shown] ?? 0))}{' '}
              before
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-micro">
              <span
                data-status={status}
                className={clsx('flex items-center gap-1 font-semibold tracking-caps uppercase', statusClasses[status])}
              >
                <StatusDot pulsing={status === 'live' && !still} />
                {statusWords[status]}
              </span>
              <span className="text-muted tabular-nums">
                {age === undefined ? 'no reading yet' : `read ${formatShort(age)} ago`} ·{' '}
                {warming ? 'last hour by minute' : 'last 10 min'}
              </span>
            </span>
          )}

          {named.length > 0 && (
            <ul aria-label="By provider" className="ml-auto flex flex-wrap items-center gap-1.5">
              {named.map(entry => (
                <li key={entry.provider}>
                  <Chip>
                    <ProviderIcon provider={entry.provider} decorative />
                    <span className="sr-only">{providerName(entry.provider)}</span>
                    <span>
                      <span className="font-semibold text-foreground">{formatCount(Math.round(entry.rate))}</span>/s
                    </span>
                  </Chip>
                </li>
              ))}
              {others > 0 && (
                <li>
                  <Chip>
                    <span>
                      +{rates.length - LEGEND_MAX} more{' '}
                      <span className="font-semibold text-foreground">{formatCount(Math.round(others))}</span>/s
                    </span>
                  </Chip>
                </li>
              )}
            </ul>
          )}
        </div>

        <p className="flex items-baseline gap-2">
          <RollingNumber value={formatCount(Math.round(rate))} className="text-display font-semibold" />
          <span className="text-caption text-muted">tokens out a second</span>
        </p>

        {traffic.error && (
          <p role="alert" className="pointer-events-auto self-start">
            <Chip className="max-w-full text-danger">
              <span className="truncate">
                The broker is not answering, so this is not current
                {age !== undefined && `: last read ${formatShort(age)} ago`}. {traffic.error}
              </span>
            </Chip>
          </p>
        )}

        {/* What it came to, at API prices, on one chip so the chart keeps the room. */}
        <p className="mt-auto flex pt-2">
          <Chip className="max-w-full">
            <span className="truncate">
              <Figure>{formatUsd(hour?.total.costUsd ?? 0)}</Figure> last hour · 24h{' '}
              <Figure>{formatUsd(day?.total.costUsd ?? 0)}</Figure> · 7d <Figure>{formatUsd(weekCost)}</Figure> at API
              prices
              {multiple !== undefined ? (
                <>
                  {' '}
                  · <Figure>{multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}×</Figure> the subscriptions
                </>
              ) : (
                cached !== undefined && (
                  <>
                    {' '}
                    · <Figure>{formatPercent(cached)}</Figure> cached
                  </>
                )
              )}
            </span>
          </Chip>
        </p>
      </div>
    </section>
  );
}
