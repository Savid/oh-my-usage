import type { Traffic } from '@/api';

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
}
