import type { Traffic } from '@/api';
import type { Pool } from '@/lib/pools';

export interface FleetBandProps {
  /** One pool per provider: the window its accounts live on (`headlinePools`). */
  pools: readonly Pool[];

  /** The traffic, once read; with no broker, `available` is false and no traffic is shown. */
  traffic?: Traffic;

  /** Where reading the traffic stands: `pending` before the first answer, `error` when there is none. */
  trafficStatus: 'pending' | 'error' | 'success';

  /** What the priced accounts cost a month together, to weigh the week's traffic against. */
  monthlyUsd?: number;

  /** The current time in milliseconds, for resets and the reading's age. */
  now: number;
}
