import { useState, type JSX, type PointerEvent } from 'react';
import clsx from 'clsx';
import { formatDateTime, formatPercent } from '@/lib/format';
import type { UsageHistoryChartProps } from './UsageHistoryChart.types';
import { MAX_SERIES, nearestIndex, sampleTimes, tableTimes, toSeries, valueAt, type Series } from './usageSeries';

// The drawing's own units; the SVG scales to its container's width.
const WIDTH = 720;
const HEIGHT = 240;
const PLOT = { left: 44, right: 12, top: 12, bottom: 28 };
const PLOT_WIDTH = WIDTH - PLOT.left - PLOT.right;
const PLOT_HEIGHT = HEIGHT - PLOT.top - PLOT.bottom;

/** The width of a one-moment chart's time axis, so its single point sits mid-plot. */
const SINGLE_POINT_SPAN_MS = 3_600_000;

// Series colours in fixed order: a series keeps its colour whatever else is drawn.
const lineClasses = ['stroke-series-1', 'stroke-series-2', 'stroke-series-3'];
const dotClasses = ['fill-series-1', 'fill-series-2', 'fill-series-3'];
const keyClasses = ['text-series-1', 'text-series-2', 'text-series-3'];

interface Scale {
  x: (time: number) => number;
  y: (usedFraction: number) => number;
  /** The share the top of the plot stands for: 1, or more when a limit ran over. */
  top: number;
}

function scale(times: readonly number[], series: readonly Series[]): Scale {
  const first = times[0] ?? 0;
  const last = times.at(-1) ?? 0;
  const start = first === last ? first - SINGLE_POINT_SPAN_MS / 2 : first;
  const span = first === last ? SINGLE_POINT_SPAN_MS : last - first;

  const peak = Math.max(1, ...series.flatMap(entry => entry.points.map(point => point.usedFraction)));
  // Whole steps of 50% above full, so the ticks stay round.
  const top = peak > 1 ? Math.ceil(peak * 2) / 2 : 1;

  return {
    x: time => PLOT.left + ((time - start) / span) * PLOT_WIDTH,
    y: usedFraction => PLOT.top + (1 - usedFraction / top) * PLOT_HEIGHT,
    top,
  };
}

function linePath(series: Series, { x, y }: Scale): string {
  return series.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.time).toFixed(1)} ${y(point.usedFraction).toFixed(1)}`)
    .join(' ');
}

/**
 * An account's recorded usage as lines over time, one per limit. The readout
 * above the plot is the legend: it names each line and gives its value, the
 * latest one or the one under the pointer. Every value is also in the table.
 */
export function UsageHistoryChart({ samples }: UsageHistoryChartProps): JSX.Element {
  const [hovered, setHovered] = useState<number>();

  const all = toSeries(samples);
  const series = all.slice(0, MAX_SERIES);
  const times = sampleTimes(series);

  if (times.length === 0) {
    return <p className="text-body text-muted">No usage has been recorded in this period yet.</p>;
  }

  const scaled = scale(times, series);
  const active = hovered !== undefined && hovered < times.length ? hovered : undefined;
  const readoutTime = times[active ?? times.length - 1]!;
  const ticks = [0, 0.5, 1, ...(scaled.top > 1 ? [scaled.top] : [])];

  const onPointerMove = (event: PointerEvent<SVGRectElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;

    const first = times[0]!;
    const last = times.at(-1)!;
    const time = first + ((event.clientX - box.left) / box.width) * (last - first);
    setHovered(nearestIndex(times, time));
  };

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-col gap-2">
        <p className="text-caption text-muted">
          {active === undefined ? 'Latest' : 'At'} {formatDateTime(readoutTime)}
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-body">
          {series.map((entry, index) => {
            const value = valueAt(entry, readoutTime);
            return (
              <li key={entry.limitId} className="flex items-center gap-2">
                {/* A short stroke of the line's colour; the text beside it stays in text colours. */}
                <svg aria-hidden="true" viewBox="0 0 16 2" className={clsx('h-0.5 w-4', keyClasses[index])}>
                  <rect width="16" height="2" rx="1" className="fill-current" />
                </svg>
                <span className="text-muted">{entry.label}</span>
                <span className="font-mono">{value === undefined ? 'none' : formatPercent(value)}</span>
              </li>
            );
          })}
        </ul>
        {all.length > MAX_SERIES && (
          <p className="text-caption text-muted">
            Showing the first {MAX_SERIES} of {all.length} limits.
          </p>
        )}
      </figcaption>

      <svg
        role="img"
        aria-label="Used share of each limit over time"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
      >
        {ticks.map(tick => (
          <g key={tick}>
            <line
              x1={PLOT.left}
              x2={WIDTH - PLOT.right}
              y1={scaled.y(tick)}
              y2={scaled.y(tick)}
              strokeWidth="1"
              className="stroke-border"
            />
            <text
              x={PLOT.left - 8}
              y={scaled.y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted text-caption"
            >
              {formatPercent(tick)}
            </text>
          </g>
        ))}

        <text x={PLOT.left} y={HEIGHT - 8} className="fill-muted text-caption">
          {formatDateTime(times[0]!)}
        </text>
        {times.length > 1 && (
          <text x={WIDTH - PLOT.right} y={HEIGHT - 8} textAnchor="end" className="fill-muted text-caption">
            {formatDateTime(times.at(-1)!)}
          </text>
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

        {series.map((entry, index) => {
          const end = entry.points.at(-1)!;
          return (
            <g key={entry.limitId}>
              <path
                d={linePath(entry, scaled)}
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                className={lineClasses[index]}
              />
              {/* The end dot, ringed in the surface colour so it stays clear where lines cross. */}
              <circle
                cx={scaled.x(end.time)}
                cy={scaled.y(end.usedFraction)}
                r="4"
                strokeWidth="2"
                className={clsx('stroke-surface', dotClasses[index])}
              />
            </g>
          );
        })}

        {/* The whole plot is the hover target: the pointer finds a time, never a line. */}
        <rect
          data-testid="plot"
          x={PLOT.left}
          y={PLOT.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill="none"
          pointerEvents="all"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHovered(undefined)}
        />
      </svg>

      <details className="text-body">
        <summary className="cursor-pointer text-muted">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="border-b border-border text-caption text-muted">
              <th scope="col" className="py-1 pr-4 font-semibold">
                Time
              </th>
              {series.map(entry => (
                <th key={entry.limitId} scope="col" className="py-1 pr-4 font-semibold">
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableTimes(times).map(time => (
              <tr key={time} className="border-b border-border">
                <th scope="row" className="py-1 pr-4 font-mono">
                  {formatDateTime(time)}
                </th>
                {series.map(entry => {
                  const value = valueAt(entry, time);
                  return (
                    <td key={entry.limitId} className="py-1 pr-4 font-mono">
                      {value === undefined ? '' : formatPercent(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
