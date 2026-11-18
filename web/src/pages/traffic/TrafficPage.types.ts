import type { Metric } from '@/lib/metrics';

export interface TrafficPageProps {
  /** What the charts show, from the link; tokens out without one. */
  metric?: Metric;

  /** Called with the choice when the switch is used; without it the page keeps its own. */
  onMetric?: (metric: Metric) => void;
}
