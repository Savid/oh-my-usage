import type { Traffic } from '@/api';

export interface TrafficBandProps {
  /** What is passing through the gateway, as getTraffic answers it with a broker. */
  traffic: Traffic;

  /** The current time in milliseconds, for how long ago traffic was read. */
  now: number;
}
