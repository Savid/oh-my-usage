import type { Traffic } from '@/api';

export interface PulseProps {
  /** The traffic through the gateway, as getTraffic answers it. */
  traffic: Traffic;

  /**
   * What the priced accounts cost a month together, from their `monthlyUsd`;
   * without it the third cell shows the cache instead of the value.
   */
  monthlyUsd?: number;

  /** The current time in milliseconds, for the reading's age. */
  now: number;
}
