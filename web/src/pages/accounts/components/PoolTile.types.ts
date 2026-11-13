import type { Pool } from '@/lib/pools';

export interface PoolTileProps {
  /** One usage window added up over a provider's accounts. */
  pool: Pool;

  /** The current time in milliseconds, for the time to the next reset. */
  now: number;
}
