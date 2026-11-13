import type { TrafficWindow } from '@/api';

export interface TrafficWindowTileProps {
  /** One recent period's traffic, in total and by provider. */
  window: TrafficWindow;
}
