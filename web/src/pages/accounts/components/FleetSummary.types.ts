import type { Fleet } from '@/lib/fleet';

export interface FleetSummaryProps {
  /** The fleet in figures (`fleetOf`). */
  fleet: Fleet;

  /** When the gateway was last read, as an ISO time; absent before the first read. */
  updatedAt?: string;

  /** The current time in milliseconds, for the reading's age. */
  now: number;
}
