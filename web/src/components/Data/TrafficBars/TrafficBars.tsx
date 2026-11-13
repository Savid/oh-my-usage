import { useState, type JSX, type PointerEvent } from 'react';
import clsx from 'clsx';
import { ProviderIcon } from '@/components/Data/ProviderIcon';
import { useElementWidth } from '@/hooks/useElementWidth';
import { providerName } from '@/lib/accounts';
import { formatClock, formatCount, formatDateTime, formatDay, formatUsd } from '@/lib/format';
import { providerTone } from '@/lib/providerTones';
import { niceCeiling, stepMs, toSteps, type Step } from '@/lib/traffic';
import type { TrafficBarsProps } from './TrafficBars.types';

// The drawing is laid out in CSS pixels to the width it is given, so a bar
// is a whole number of pixels wide and the text stays the size it is set at.
const FALLBACK_WIDTH = 720;
const SIZES = {
  band: { height: 112, className: 'h-28' },
  panel: { height: 208, className: 'h-52' },
};
const PLOT = { top: 14, bottom: 18 };

/** The smallest bar that still reads as one: traffic is never drawn as nothing. */
const MIN_BAR = 1.5;

/** How close to the right edge a tick label may start before it is left out. */
const LABEL_ROOM = 44;

/** Where the time axis is labelled: each midnight of a week, each quarter of an hour. */
function tick(step: Step, hourly: boolean): string | undefined {
  const date = new Date(step.start);
  if (hourly) return date.getHours() === 0 ? formatDay(step.start) : undefined;
  return date.getMinutes() % 15 === 0 ? formatClock(step.start) : undefined;
}

/**
 * Traffic over time as bars, one per minute or hour, each stacked by provider
 * in the provider's colour; its height is the cost at API prices. The line
 * above the plot is the readout and the legend: it gives the latest full
 * step, or the one under the pointer, in total and for each provider.
 */
export function TrafficBars({ series, label, size = 'panel', measuredSince }: TrafficBarsProps): JSX.Element {
  const [hovered, setHovered] = useState<number>();
  const [frame, width] = useElementWidth<HTMLDivElement>(FALLBACK_WIDTH);
  const { height, className } = SIZES[size];

  const steps = toSteps(series);
  const hourly = series.stepSeconds >= 3600;
  const per = hourly ? 'h' : 'min';
  const plotHeight = height - PLOT.top - PLOT.bottom;
  const floor = PLOT.top + plotHeight;
  const stepWidth = width / steps.length;
  const gap = stepWidth >= 6 ? 2 : stepWidth >= 3 ? 1 : 0;
  const top = niceCeiling(Math.max(0, ...steps.map(step => step.costUsd)));
  const quiet = steps.every(step => step.parts.length === 0);

  // The last step is still filling, so the readout rests on the one before it.
  const latest = Math.max(0, steps.length - 2);
  const active = hovered !== undefined && hovered < steps.length ? hovered : undefined;
  const shown = steps[active ?? latest]!;

  const measuredFrom = measuredSince === undefined ? undefined : Date.parse(measuredSince);
  const estimated = (step: Step): boolean => measuredFrom !== undefined && step.start + stepMs(series) <= measuredFrom;
  const boundary =
    measuredFrom === undefined ? undefined : ((measuredFrom - Date.parse(series.start)) / stepMs(series)) * stepWidth;
  const marked = boundary !== undefined && boundary > 0 && boundary < width;

  const onPointerMove = (event: PointerEvent<SVGRectElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;

    const index = Math.floor(((event.clientX - box.left) / box.width) * steps.length);
    setHovered(Math.min(steps.length - 1, Math.max(0, index)));
  };

  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption">
        <span className="text-micro tracking-caps text-muted uppercase">
          {active === undefined ? 'Latest' : 'At'} {hourly ? formatDateTime(shown.start) : formatClock(shown.start)}
        </span>
        <span className="font-semibold tabular-nums">{formatUsd(shown.costUsd)}</span>
        <span className="text-muted tabular-nums">
          {formatCount(shown.requests)} req · {formatCount(shown.tokens)} tok
        </span>
        {estimated(shown) && <span className="text-muted">estimate</span>}

        {series.providers.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 sm:ml-auto">
            {series.providers.map(entry => {
              const part = shown.parts.find(candidate => candidate.provider === entry.provider);
              return (
                <li key={entry.provider} className="flex items-center gap-1.5">
                  <ProviderIcon provider={entry.provider} decorative />
                  <span className="text-muted">{providerName(entry.provider)}</span>
                  <span className="font-semibold tabular-nums">{formatUsd(part?.costUsd ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </figcaption>

      <div ref={frame} className="relative">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${width} ${height}`}
          className={clsx('block w-full', className)}
        >
          {/* The top of the scale, with its figure; the floor the bars stand on. */}
          <line x1="0" x2={width} y1={PLOT.top} y2={PLOT.top} strokeWidth="1" className="stroke-border" />
          <text x="0" y={PLOT.top - 4} className="fill-muted text-micro">
            {formatUsd(top)}/{per}
          </text>
          <line x1="0" x2={width} y1={floor} y2={floor} strokeWidth="1" className="stroke-border-strong" />

          {steps.map((step, index) => {
            const text = tick(step, hourly);
            const x = index * stepWidth;
            if (text === undefined || x > width - LABEL_ROOM) return null;

            return (
              <g key={step.start}>
                <line x1={x} x2={x} y1={PLOT.top} y2={floor + 4} strokeWidth="1" className="stroke-border" />
                <text x={x + 4} y={height - 4} className="fill-muted text-micro">
                  {text}
                </text>
              </g>
            );
          })}

          {active !== undefined && (
            <rect
              data-testid="highlight"
              x={active * stepWidth}
              y={PLOT.top}
              width={stepWidth}
              height={plotHeight}
              className="fill-raised"
            />
          )}

          {steps.map((step, index) => {
            let base = floor;

            return (
              <g key={step.start} data-step={index}>
                {step.parts.map(part => {
                  const tall = Math.max(MIN_BAR, (part.costUsd / top) * plotHeight);
                  base -= tall;

                  return (
                    <rect
                      key={part.provider}
                      x={index * stepWidth + gap / 2}
                      y={base}
                      width={Math.max(1, stepWidth - gap)}
                      // A sliver of the surface between two providers' parts.
                      height={tall > 3 ? tall - 1 : tall}
                      className={providerTone(part.provider).fill}
                    />
                  );
                })}
              </g>
            );
          })}

          {marked && (
            <g data-testid="measured-from">
              <line
                x1={boundary}
                x2={boundary}
                y1={PLOT.top}
                y2={floor}
                strokeWidth="1"
                strokeDasharray="2 3"
                className="stroke-border-strong"
              />
              <text
                x={boundary > width - 96 ? boundary - 6 : boundary + 6}
                y={PLOT.top + 12}
                textAnchor={boundary > width - 96 ? 'end' : 'start'}
                className="fill-muted text-micro"
              >
                {boundary > width - 96 ? 'estimated before' : 'measured from here'}
              </text>
            </g>
          )}

          {/* The whole plot is the hover target: the pointer finds a step, never a bar. */}
          <rect
            data-testid="plot"
            x="0"
            y={PLOT.top}
            width={width}
            height={plotHeight}
            fill="none"
            pointerEvents="all"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHovered(undefined)}
          />
        </svg>

        {quiet && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-caption text-muted">
            No traffic in this period.
          </p>
        )}
      </div>
    </figure>
  );
}
