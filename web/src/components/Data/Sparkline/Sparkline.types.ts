import type { SparkPoint } from '@/lib/sparkline';

export interface SparklineProps {
  /** The values to draw, oldest first, each a share from 0 to 1 (above 1 stops at the top). */
  points: readonly SparkPoint[];

  /** Where the chart begins, in milliseconds. */
  start: number;

  /** Where the chart ends, in milliseconds. */
  end: number;

  /** The line's colour, as a `stroke-*` class. */
  line: string;

  /** The glow's colour, as a `text-*` class its gradient stops inherit. */
  glow: string;

  /**
   * How the glow is drawn: `track` is solid at the line and fades to a fifth,
   * for a provider's track colour; `tint` is a faint wash that fades to
   * nothing, for a full-strength colour.
   * @default 'track'
   */
  wash?: 'track' | 'tint';

  /**
   * Whether a dot in the line's colour marks the newest point.
   * @default false
   */
  head?: boolean;

  /** A level to draw, flat and without a line, when there are fewer than two points. */
  level?: number;

  /** Sizing classes for the box the chart stretches to fill. */
  className?: string;
}
