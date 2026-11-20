import type { Traffic } from '@/api';
import type { Metric } from '@/lib/metrics';

export interface LiveTrafficProps {
  /** The traffic through the gateway, as getTraffic answers it. */
  traffic: Traffic;

  /**
   * What the priced accounts cost a month together, from their `monthlyUsd`;
   * with it the week's traffic is weighed against the subscriptions, without
   * it the cache is shown instead.
   */
  monthlyUsd?: number;

  /** The current time in milliseconds, for the reading's age. */
  now: number;

  /**
   * `band` is a cell of the homepage's top band, leading to the Traffic page;
   * `page` fills the Traffic page's band under its first line, taller, its heading only heard.
   * @default 'band'
   */
  variant?: 'band' | 'page';

  /** What is drawn, when the page chooses it; without it the switch keeps its own choice, tokens out at first. */
  metric?: Metric;

  /** Called with the choice when the switch is used, when the page keeps it. */
  onMetric?: (metric: Metric) => void;
}
