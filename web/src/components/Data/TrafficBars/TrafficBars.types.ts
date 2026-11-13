import type { TrafficSeries } from '@/api';

export interface TrafficBarsProps {
  /** The traffic to draw, as getTraffic answers it: by minute or by hour. */
  series: TrafficSeries;

  /** What the chart shows, for assistive technology. */
  label: string;

  /** `band` is short, to sit in a row; `panel` is tall, for a chart of its own. */
  size?: 'band' | 'panel';

  /** When traffic began to be measured, as an ISO time. Steps before it are marked as estimates. */
  measuredSince?: string;
}
