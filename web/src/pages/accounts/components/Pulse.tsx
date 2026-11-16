import type { JSX, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { TrafficWindow } from '@/api';
import { Sparkline } from '@/components/Data/Sparkline';
import { WEEKS_PER_MONTH } from '@/lib/fleet';
import { formatCount, formatPercent, formatPrice, formatShort, formatUsd } from '@/lib/format';
import type { SparkPoint } from '@/lib/sparkline';
import { cacheShare, niceCeiling, stepMs, toSteps, type Step } from '@/lib/traffic';
import type { PulseProps } from './Pulse.types';

/** Traffic older than this is called out: readings come every few seconds. */
const STALE_MS = 2 * 60_000;

// Each instrument wears a chart series colour, none of them a status colour.
const seriesClasses = {
  tokens: { line: 'stroke-series-2', glow: 'text-series-2' },
  burn: { line: 'stroke-series-3', glow: 'text-series-3' },
} as const;

const valueBarClasses = {
  api: 'fill-series-3',
  subscriptions: 'fill-foreground',
} as const;

/** A step's points for a chart, each scaled against the busiest, and the busiest itself. */
function scaled(steps: readonly Step[], value: (step: Step) => number): { points: SparkPoint[]; peak: number } {
  const peak = Math.max(0, ...steps.map(value));
  const top = niceCeiling(peak);
  return { points: steps.map(step => ({ time: step.start, value: value(step) / top })), peak };
}

function byId(windows: readonly TrafficWindow[], id: TrafficWindow['id']): TrafficWindow | undefined {
  return windows.find(window => window.id === id);
}

interface CellProps {
  label: string;
  figure: string;
  unit: string;
  foot: ReactNode;
  children?: ReactNode;
}

/** One instrument: a name, a big figure with its unit, a picture and a line of context. */
function Cell({ label, figure, unit, foot, children }: CellProps): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
      <span className="text-micro tracking-caps text-muted uppercase">{label}</span>
      <p className="flex items-baseline gap-1.5">
        <span className="text-display font-semibold tabular-nums">{figure}</span>
        <span className="text-caption text-muted">{unit}</span>
      </p>
      {children}
      <p className="text-caption text-muted tabular-nums">{foot}</p>
    </div>
  );
}

/**
 * The gateway's pulse, as three instruments. How many tokens it is
 * generating a second, over the last hour by minute. What that burns an hour
 * at API prices, over the same hour. And what the subscriptions are worth:
 * the week's traffic at API prices against what the priced accounts cost a
 * week, or, with no prices, how much input was read from a cache.
 */
export function Pulse({ traffic, monthlyUsd, now }: PulseProps): JSX.Element {
  const hour = byId(traffic.windows, 'hour');
  const day = byId(traffic.windows, 'day');
  const week = byId(traffic.windows, 'week');
  const age = traffic.updatedAt === undefined ? undefined : now - Date.parse(traffic.updatedAt);

  // The newest step is still filling: the rate is read from the one before it.
  const all = toSteps(traffic.minutes);
  const steps = all.length > 1 ? all.slice(0, -1) : all;
  const seconds = stepMs(traffic.minutes) / 1000;
  const start = steps[0]?.start ?? now;
  const end = steps.at(-1)?.start ?? now;
  const latest = steps.at(-1);

  const tokens = scaled(steps, step => step.outputTokens / seconds);
  const burn = scaled(steps, step => (step.costUsd * 3600) / seconds);
  const perSecond = latest ? latest.outputTokens / seconds : 0;
  const perHour = hour?.total.costUsd ?? 0;

  const weekCost = week?.total.costUsd ?? 0;
  const weekPrice = monthlyUsd === undefined ? undefined : monthlyUsd / WEEKS_PER_MONTH;
  const multiple = weekPrice !== undefined && weekPrice > 0 ? weekCost / weekPrice : undefined;
  const cached = day ? cacheShare(day.total) : undefined;

  return (
    <section aria-labelledby="traffic-heading" className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex items-baseline gap-2 border-b border-border px-4 py-2">
        <h2 id="traffic-heading" className="text-body font-semibold tracking-caps uppercase">
          <Link to="/traffic" className="underline-offset-4 hover:underline">
            Traffic
          </Link>
        </h2>
        <span className="text-micro text-muted">through the gateway</span>
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
        <p role="alert" className="border-b border-border px-4 py-2 text-caption text-danger">
          The broker is not answering, so this is not current
          {age !== undefined && `: last read ${formatShort(age)} ago`}. {traffic.error}
        </p>
      )}

      <div className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <Cell
          label="Generating"
          figure={formatCount(Math.round(perSecond))}
          unit="tokens out a second"
          foot={
            <>
              last hour {formatCount(hour?.total.outputTokens ?? 0)} out · peak {formatCount(Math.round(tokens.peak))}/s
            </>
          }
        >
          <Sparkline
            points={tokens.points}
            start={start}
            end={end}
            line={seriesClasses.tokens.line}
            glow={seriesClasses.tokens.glow}
            wash="tint"
            head
            className="h-14"
          />
        </Cell>

        <Cell
          label="Burn at API prices"
          figure={formatUsd(perHour)}
          unit="last hour"
          foot={
            <>
              24h {formatUsd(day?.total.costUsd ?? 0)} · 7d {formatUsd(weekCost)}
            </>
          }
        >
          <Sparkline
            points={burn.points}
            start={start}
            end={end}
            line={seriesClasses.burn.line}
            glow={seriesClasses.burn.glow}
            wash="tint"
            head
            className="h-14"
          />
        </Cell>

        {multiple !== undefined && weekPrice !== undefined ? (
          <Cell
            label="Value · last 7 days"
            figure={`${multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}×`}
            unit="the subscriptions' cost, at API prices"
            foot={<>{formatPrice(monthlyUsd ?? 0)}/mo of subscriptions</>}
          >
            {/* The week at API prices fills the scale; the subscriptions' week is measured against it. */}
            <dl className="flex h-14 flex-col justify-center gap-1.5 text-micro">
              {[
                { name: 'At API prices', amount: weekCost, bar: valueBarClasses.api },
                { name: 'Subscriptions', amount: weekPrice, bar: valueBarClasses.subscriptions },
              ].map(bar => (
                <div key={bar.name} className="flex items-center gap-2">
                  <dt className="w-24 shrink-0 text-muted">{bar.name}</dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-2 tabular-nums">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 100 2"
                      preserveAspectRatio="none"
                      className="block h-2 min-w-0 flex-1"
                    >
                      <rect width="100" height="2" className="fill-raised" />
                      <rect
                        width={Math.max(1, Math.round((bar.amount / Math.max(weekCost, weekPrice)) * 1000) / 10)}
                        height="2"
                        className={bar.bar}
                      />
                    </svg>
                    <span className="w-14 shrink-0 text-right font-semibold">{formatUsd(bar.amount)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Cell>
        ) : (
          <Cell
            label="Cache"
            figure={cached === undefined ? '—' : formatPercent(cached)}
            unit="of input read from a cache"
            foot={<>24h {formatCount(day?.total.cacheReadTokens ?? 0)} read from a cache</>}
          />
        )}
      </div>
    </section>
  );
}
