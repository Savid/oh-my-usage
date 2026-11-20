import { useId, useState, type JSX, type PointerEvent } from 'react';
import clsx from 'clsx';
import { useElementWidth } from '@/hooks/useElementWidth';
import { primaryLimit, shortLimitLabel } from '@/lib/accounts';
import { formatDateTime, formatDay, formatPercent } from '@/lib/format';
import { providerTone } from '@/lib/providerTones';
import type { UsageHistoryChartProps } from './UsageHistoryChart.types';
import { MAX_SERIES, nearestIndex, sampleTimes, tableTimes, toSeries, valueAt, type Series } from './usageSeries';

// The drawing is laid out in CSS pixels to the width it is given, so its
// text stays the size it is set at on a phone and on a wide screen alike.
const FALLBACK_WIDTH = 720;
const HEIGHT = 224;
const PLOT = { left: 44, right: 16, top: 12, bottom: 24 };
const PLOT_HEIGHT = HEIGHT - PLOT.top - PLOT.bottom;

/** The width of a one-moment chart's time axis, so its single point sits mid-plot. */
const SINGLE_POINT_SPAN_MS = 3_600_000;

/** A day's label needs this much room from the plot's edges, or it is left off. */
const LABEL_ROOM = 24;

/** The least room between two days' labels; with less, only every second or third day is named. */
const LABEL_SPACING = 64;

interface Dress {
  line: string;
  dot: string;
  key: string;
  /** The glow under the line, as a text colour its gradient stops inherit; the main window's only. */
  glow?: string;
}

// Series colours in fixed order: a series keeps its colour whatever else is drawn.
const seriesClasses: readonly Dress[] = [
  { line: 'stroke-series-1', dot: 'fill-series-1', key: 'text-series-1' },
  { line: 'stroke-series-2', dot: 'fill-series-2', key: 'text-series-2' },
  { line: 'stroke-series-3', dot: 'fill-series-3', key: 'text-series-3' },
];

interface Scale {
  x: (time: number) => number;
  y: (used: number) => number;
}

function scale(times: readonly number[], plotWidth: number): Scale {
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? 0;
  const start = first === last ? first - SINGLE_POINT_SPAN_MS / 2 : first;
  const span = first === last ? SINGLE_POINT_SPAN_MS : last - first;

  return {
    x: time => PLOT.left + ((time - start) / span) * plotWidth,
    // A limit run over stops at the top; the readout and the table give its figure.
    y: used => PLOT.top + (1 - Math.min(1, Math.max(0, used))) * PLOT_HEIGHT,
  };
}

function linePath(series: Series, { x, y }: Scale): string {
  return series.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.time).toFixed(1)} ${y(point.used).toFixed(1)}`)
    .join(' ');
}

/** The ground under a line, down to the plot's foot. */
function areaPath(series: Series, scaled: Scale): string {
  const first = series.points[0];
  const last = series.points.at(-1);
  if (!first || !last) return '';
  const foot = (PLOT.top + PLOT_HEIGHT).toFixed(1);
  return `${linePath(series, scaled)} L${scaled.x(last.time).toFixed(1)} ${foot} L${scaled.x(first.time).toFixed(1)} ${foot} Z`;
}

/** Each midnight between the first moment and the last, where the time axis is labelled. */
function midnights(first: number, last: number): number[] {
  const out: number[] = [];
  const day = new Date(first);
  day.setHours(24, 0, 0, 0);
  while (day.getTime() < last) {
    out.push(day.getTime());
    day.setDate(day.getDate() + 1);
  }
  return out;
}

/**
 * How much of each limit an account had used over time, one line per limit,
 * the main window first in its provider's colour with a glow under it, as on
 * its row. The line above the plot is the legend: a chip per line with its
 * value, the latest or the one under the pointer. Every value is also in the
 * table.
 */
export function UsageHistoryChart({ samples, provider, limits, heading }: UsageHistoryChartProps): JSX.Element {
  const [hovered, setHovered] = useState<number>();
  const [frame, width] = useElementWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const glowId = useId();
  const plotWidth = Math.max(1, width - PLOT.left - PLOT.right);

  const main = limits && provider ? primaryLimit(limits) : undefined;
  const tone = provider ? providerTone(provider) : undefined;
  // The main window leads; the rest keep the order they were first seen in.
  const all = toSeries(samples).sort(
    (one, other) => Number(other.limitId === main?.id) - Number(one.limitId === main?.id)
  );
  const series = all.slice(0, MAX_SERIES);
  const times = sampleTimes(series);

  // The main window wears the provider's colour; the others take the series colours after the first.
  const isMain = (entry: Series): boolean => tone !== undefined && entry.limitId === main?.id;
  const others = series.filter(entry => !isMain(entry));
  const offset = main && tone ? 1 : 0;
  const drawn = series.map(entry => {
    const limit = limits?.find(candidate => candidate.id === entry.limitId);
    const dress: Dress =
      tone && isMain(entry)
        ? { line: tone.line, dot: tone.fill, key: tone.icon, glow: tone.glow }
        : (seriesClasses[(others.indexOf(entry) + offset) % seriesClasses.length] ?? seriesClasses[0]!);
    return { ...entry, name: limit ? shortLimitLabel(limit) : entry.label, dress };
  });

  const empty = times.length === 0;
  const scaled = scale(times, plotWidth);
  const active = !empty && hovered !== undefined && hovered < times.length ? hovered : undefined;
  const readoutTime = empty ? undefined : times[active ?? times.length - 1];
  const ticks = [0, 0.5, 1];
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? 0;
  const days = midnights(first, last);
  const dayWidth = last > first ? (plotWidth * 86_400_000) / (last - first) : plotWidth;
  const every = Math.max(1, Math.ceil(LABEL_SPACING / dayWidth));
  const named = (day: number, index: number): boolean =>
    index % every === every - 1 &&
    scaled.x(day) > PLOT.left + LABEL_ROOM &&
    scaled.x(day) < width - PLOT.right - LABEL_ROOM;

  const onPointerMove = (event: PointerEvent<SVGRectElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const time = first + ((event.clientX - box.left) / box.width) * (last - first);
    setHovered(nearestIndex(times, time));
  };

  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-2">
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4">
        {heading}
        {readoutTime !== undefined && (
          <span className="text-micro text-muted tabular-nums">
            {active === undefined ? 'Latest' : 'At'} {formatDateTime(readoutTime)}
          </span>
        )}
        {!empty && (
          <ul className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            {drawn.map(entry => {
              const value = readoutTime === undefined ? undefined : valueAt(entry, readoutTime);
              return (
                <li
                  key={entry.limitId}
                  className="flex h-6 items-center gap-1.5 rounded-sm border border-border bg-surface px-2 text-micro whitespace-nowrap text-muted tabular-nums"
                >
                  {/* A short stroke of the line's colour; the words beside it stay in text colours. */}
                  <svg aria-hidden="true" viewBox="0 0 12 2" className={clsx('h-0.5 w-3', entry.dress.key)}>
                    <rect width="12" height="2" rx="1" className="fill-current" />
                  </svg>
                  <span>{entry.name}</span>
                  <span className="font-semibold text-foreground">
                    {value === undefined ? 'none' : formatPercent(value)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </figcaption>

      {all.length > MAX_SERIES && (
        <p className="px-4 text-caption text-muted">
          Showing the first {MAX_SERIES} of {all.length} limits.
        </p>
      )}

      {empty ? (
        <p className="flex min-h-40 flex-1 items-center px-4 text-caption text-muted">
          No usage has been recorded in this period yet.
        </p>
      ) : (
        <>
          <div ref={frame}>
            <svg
              role="img"
              aria-label="Used share of each limit over time"
              viewBox={`0 0 ${width} ${HEIGHT}`}
              className="block h-56 w-full"
            >
              <defs>
                {drawn.map(
                  (entry, index) =>
                    entry.dress.glow && (
                      <linearGradient
                        key={entry.limitId}
                        id={`${glowId}-${index}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                        className={entry.dress.glow}
                      >
                        <stop offset="0" stopColor="currentColor" />
                        <stop offset="1" stopColor="currentColor" stopOpacity="0.1" />
                      </linearGradient>
                    )
                )}
              </defs>

              {ticks.map(tick => (
                <g key={tick}>
                  <line
                    x1={PLOT.left}
                    x2={width - PLOT.right}
                    y1={scaled.y(tick)}
                    y2={scaled.y(tick)}
                    strokeWidth="1"
                    strokeDasharray={tick === 0 ? undefined : '2 4'}
                    className="stroke-border"
                  />
                  <text
                    x={PLOT.left - 8}
                    y={scaled.y(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-muted text-micro"
                  >
                    {formatPercent(tick)}
                  </text>
                </g>
              ))}

              {days.map((day, index) => (
                <g key={day}>
                  <line
                    x1={scaled.x(day)}
                    x2={scaled.x(day)}
                    y1={PLOT.top}
                    y2={PLOT.top + PLOT_HEIGHT}
                    strokeWidth="1"
                    strokeDasharray="2 4"
                    className="stroke-border"
                  />
                  {named(day, index) && (
                    <text x={scaled.x(day)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-micro">
                      {formatDay(day)}
                    </text>
                  )}
                </g>
              ))}

              {drawn.map(
                (entry, index) =>
                  entry.dress.glow && (
                    <path key={entry.limitId} d={areaPath(entry, scaled)} fill={`url(#${glowId}-${index})`} />
                  )
              )}

              {active !== undefined && (
                <line
                  data-testid="crosshair"
                  x1={scaled.x(times[active]!)}
                  x2={scaled.x(times[active]!)}
                  y1={PLOT.top}
                  y2={PLOT.top + PLOT_HEIGHT}
                  strokeWidth="1"
                  className="stroke-border-strong"
                />
              )}

              {/* The main window's line last, over the others. */}
              {[...drawn].reverse().map(entry => {
                const end = entry.points.at(-1)!;
                const at = active === undefined ? undefined : valueAt(entry, times[active]!);
                return (
                  <g key={entry.limitId}>
                    <path
                      d={linePath(entry, scaled)}
                      fill="none"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className={entry.dress.line}
                    />
                    {/* A dot, ringed in the surface colour so it stays clear where lines cross: at
                        the end, and where the pointer is. */}
                    <circle
                      cx={scaled.x(end.time)}
                      cy={scaled.y(end.used)}
                      r="4"
                      strokeWidth="2"
                      className={clsx('stroke-surface', entry.dress.dot)}
                    />
                    {at !== undefined && (
                      <circle
                        data-testid="hover-dot"
                        cx={scaled.x(times[active!]!)}
                        cy={scaled.y(at)}
                        r="4"
                        strokeWidth="2"
                        className={clsx('stroke-surface', entry.dress.dot)}
                      />
                    )}
                  </g>
                );
              })}

              {/* The whole plot is the hover target: the pointer finds a time, never a line. */}
              <rect
                data-testid="plot"
                x={PLOT.left}
                y={PLOT.top}
                width={plotWidth}
                height={PLOT_HEIGHT}
                fill="none"
                pointerEvents="all"
                onPointerMove={onPointerMove}
                onPointerLeave={() => setHovered(undefined)}
              />
            </svg>
          </div>

          <details className="px-4 text-caption">
            <summary className="w-fit cursor-pointer text-micro text-muted hover:text-foreground">
              Show as a table
            </summary>
            <table className="mt-2 w-full text-left">
              <thead>
                <tr className="border-b border-border text-micro tracking-caps text-muted uppercase">
                  <th scope="col" className="py-1 pr-4 font-semibold">
                    Time
                  </th>
                  {drawn.map(entry => (
                    <th key={entry.limitId} scope="col" className="py-1 pr-4 font-semibold">
                      {entry.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableTimes(times).map(time => (
                  <tr key={time} className="border-b border-border">
                    <th scope="row" className="py-1 pr-4 font-medium tabular-nums">
                      {formatDateTime(time)}
                    </th>
                    {drawn.map(entry => {
                      const value = valueAt(entry, time);
                      return (
                        <td key={entry.limitId} className="py-1 pr-4 tabular-nums">
                          {value === undefined ? '' : formatPercent(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}
