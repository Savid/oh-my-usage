/** One value at a moment: `time` in milliseconds, `value` a share from 0 to 1. */
export interface SparkPoint {
  time: number;
  value: number;
}

export interface SparkPaths {
  /** The line through the points. */
  line: string;
  /** The line closed down to the baseline, for the fill under it. */
  area: string;
}

/**
 * SVG paths for a small chart of shares over time, in a box `width` by
 * `height`. The box spans `start` to `end` across and 0 to 1 upward; values
 * above 1 stop at the top. Returns nothing for fewer than two points or an
 * empty span.
 */
export function sparkPaths(
  points: readonly SparkPoint[],
  start: number,
  end: number,
  width: number,
  height: number
): SparkPaths | undefined {
  if (points.length < 2 || end <= start) return undefined;

  // One unit of headroom, so a line at 100% is not cut by the box's edge.
  const top = 1;
  const x = (time: number): number => Math.min(Math.max((time - start) / (end - start), 0), 1) * width;
  const y = (value: number): number => top + (1 - Math.min(Math.max(value, 0), 1)) * (height - top);

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.time).toFixed(2)} ${y(point.value).toFixed(2)}`)
    .join(' ');
  const first = x(points[0]!.time).toFixed(2);
  const last = x(points.at(-1)!.time).toFixed(2);

  return { line, area: `${line} L${last} ${height} L${first} ${height} Z` };
}
