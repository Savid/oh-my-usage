import { useId, type JSX } from 'react';
import clsx from 'clsx';
import { sparkPaths } from '@/lib/sparkline';
import type { SparklineProps } from './Sparkline.types';

// The chart's own units; it stretches to its box.
const WIDTH = 100;
const HEIGHT = 40;

/** Where the glow's stops sit, top then bottom, for each fill. */
const STOPS = { track: [1, 0.2], tint: [0.35, 0] } as const;

/**
 * A small chart of shares over time: a line with a glow under it, deepest at
 * the line. With a `head`, a dot marks the newest value. Without enough
 * points, a flat glow at `level` claims a level and no history. It is
 * decoration: whatever it shows must also be written beside it.
 */
export function Sparkline({
  points,
  start,
  end,
  line,
  glow,
  wash = 'track',
  head = false,
  level,
  className,
}: SparklineProps): JSX.Element {
  const glowId = useId();
  const drawn = sparkPaths(points, start, end, WIDTH, HEIGHT);
  const flat =
    drawn || level === undefined
      ? undefined
      : sparkPaths(
          [
            { time: 0, value: level },
            { time: 1, value: level },
          ],
          0,
          1,
          WIDTH,
          HEIGHT
        );
  const area = drawn?.area ?? flat?.area;
  const [top, bottom] = STOPS[wash];

  return (
    <div
      aria-hidden="true"
      data-chart={drawn ? 'history' : flat ? 'level' : 'none'}
      className={clsx('relative', className)}
    >
      {area && (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id={glowId} x1="0" y1="0" x2="0" y2="1" className={glow}>
              <stop offset="0" stopColor="currentColor" stopOpacity={top} />
              <stop offset="1" stopColor="currentColor" stopOpacity={bottom} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${glowId})`} />
          {drawn && (
            <path
              d={drawn.line}
              fill="none"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={line}
            />
          )}
          {/* A line of no length with round ends is a dot the chart's stretch cannot squash. */}
          {head && drawn && (
            <line
              data-testid="head"
              x1={drawn.end.x}
              x2={drawn.end.x}
              y1={drawn.end.y}
              y2={drawn.end.y}
              strokeWidth="6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={line}
            />
          )}
        </svg>
      )}
    </div>
  );
}
