import { useId, useLayoutEffect, useRef, type JSX, type PointerEvent } from 'react';
import clsx from 'clsx';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { drawLive, nearestPoint } from '@/lib/live';
import { providerTone } from '@/lib/providerTones';
import type { LiveChartProps } from './LiveChart.types';

// The chart's own units; it stretches to its box. The newest point stops a
// little short of the right edge, so its ping has room to spread.
const WIDTH = 1000;
const HEIGHT = 100;
const RIGHT = 985;
/** How far the newest point's dot stays from the top and bottom edges, so it is never cut in half. */
const INSET = 3;

/** How long the chart takes to glide to a new reading, and how it slows into place. */
const GLIDE_MS = 900;
const GLIDE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** How long one ring of the newest point's ping takes to spread and fade. */
const PING = '1.8s';

/**
 * The gateway's traffic as it happens: each provider's rate of output
 * tokens, stacked, the costliest at the bottom, in its colour, with the
 * newest point pinging at the right edge. When a reading comes in, the chart
 * glides left to make room for it, and eases to a new scale rather than
 * jumping. Moving the pointer over it picks the nearest point. It is
 * decoration: what it shows is written beside it.
 */
export function LiveChart({ view, span, scrub, onScrub, className }: LiveChartProps): JSX.Element {
  const gradientId = useId();
  const groupRef = useRef<SVGGElement>(null);
  const shownRef = useRef<{ end: number; max: number } | undefined>(undefined);
  const still = usePrefersReducedMotion();

  const end = view.times.at(-1) ?? 0;
  const drawing = drawLive(view, { width: RIGHT, height: HEIGHT, span: (span * RIGHT) / WIDTH, end });
  const drawn = drawing !== undefined;
  const max = drawing?.max ?? 0;
  const top = drawing?.layers.at(-1)?.provider;
  const headClass = top === undefined ? 'stroke-border-strong' : providerTone(top).line;
  const quiet = drawing?.layers.length === 0;
  const head = drawing && { x: drawing.head.x, y: Math.min(HEIGHT - INSET, Math.max(INSET, drawing.head.y)) };
  const scrubbed = scrub === undefined ? undefined : drawing?.tops[scrub];

  // The new drawing is in place; it is first shown where the old one was,
  // moved right by the time that passed and stretched to the old scale, and
  // let go to glide home.
  useLayoutEffect(() => {
    const shown = shownRef.current;
    shownRef.current = drawn ? { end, max } : undefined;
    const group = groupRef.current;
    if (!shown || !drawn || still || !group || typeof group.animate !== 'function') return;
    if (shown.end === end && shown.max === max) return;

    const dx = Math.max(0, ((end - shown.end) / span) * WIDTH);
    const k = max / shown.max;
    group.animate([{ transform: `translate(${dx}px, ${HEIGHT * (1 - k)}px) scale(1, ${k})` }, { transform: 'none' }], {
      duration: GLIDE_MS,
      easing: GLIDE_EASING,
    });
  }, [drawn, end, max, span, still]);

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    const first = view.times[0];
    if (box.width === 0 || first === undefined) return;

    const time = end - ((RIGHT - ((event.clientX - box.left) / box.width) * WIDTH) / WIDTH) * span;
    onScrub(time < first - view.stepMs ? undefined : nearestPoint(view, time));
  }

  return (
    <div
      aria-hidden="true"
      data-chart={drawing ? 'live' : 'none'}
      className={clsx('touch-pan-y', className)}
      onPointerMove={onPointerMove}
      onPointerLeave={() => onScrub(undefined)}
    >
      {drawing && (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="block size-full">
          <defs>
            {drawing.layers.map((layer, index) => (
              <linearGradient
                key={layer.provider}
                id={`${gradientId}-${index}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
                className={providerTone(layer.provider).glow}
              >
                <stop offset="0" stopColor="currentColor" stopOpacity="1" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0.25" />
              </linearGradient>
            ))}
          </defs>

          <g ref={groupRef}>
            {drawing.layers.map((layer, index) => (
              <path key={layer.provider} d={layer.area} fill={`url(#${gradientId}-${index})`} />
            ))}
            {drawing.layers.map(layer => (
              <path
                key={layer.provider}
                data-provider={layer.provider}
                d={layer.line}
                fill="none"
                strokeWidth="1.5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className={providerTone(layer.provider).line}
              />
            ))}

            {/* Nothing passing: a flat line along the bottom, still pinging, so quiet reads as quiet and not as broken. */}
            {quiet && (
              <line
                data-testid="baseline"
                x1={drawing.tops[0]?.x}
                x2={drawing.head.x}
                y1={HEIGHT - INSET}
                y2={HEIGHT - INSET}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                className="stroke-border-strong"
              />
            )}

            {/* Lines of no length with round ends are dots the chart's stretch cannot squash. */}
            {head && (
              <g data-testid="head" className={headClass}>
                {!still && (
                  <line
                    x1={head.x}
                    x2={head.x}
                    y1={head.y}
                    y2={head.y}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  >
                    <animate attributeName="stroke-width" values="5;22" dur={PING} repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.6;0" dur={PING} repeatCount="indefinite" />
                  </line>
                )}
                <line
                  x1={head.x}
                  x2={head.x}
                  y1={head.y}
                  y2={head.y}
                  strokeWidth="6"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </g>

          {scrubbed && (
            <g data-testid="crosshair">
              <line
                x1={scrubbed.x}
                x2={scrubbed.x}
                y1="0"
                y2={HEIGHT}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                className="stroke-border-strong"
              />
              <line
                x1={scrubbed.x}
                x2={scrubbed.x}
                y1={scrubbed.y}
                y2={scrubbed.y}
                strokeWidth="7"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-foreground"
              />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
