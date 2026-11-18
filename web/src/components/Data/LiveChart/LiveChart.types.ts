import type { LiveView } from '@/lib/live';

export interface LiveChartProps {
  /** The traffic read as rates by provider (`liveView`). */
  view: LiveView;

  /** How much time the chart's width shows, in milliseconds; the newest point is at the right edge. */
  span: number;

  /** The point being read, by its index in the view; nothing when none is. */
  scrub?: number;

  /** Called with the point nearest the pointer as it moves over the chart, and with nothing when it leaves. */
  onScrub: (index: number | undefined) => void;

  /** Called when the chart is clicked; with it the chart reads as a way through to more. */
  onSelect?: () => void;

  /** Sizing and placing classes for the box the chart fills. */
  className?: string;
}
