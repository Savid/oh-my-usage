import type { Limit } from '@/api';

export interface UsageMeterProps {
  /** The usage window to draw. */
  limit: Limit;

  /** The current time in milliseconds, for the time left until the window resets. */
  now: number;
}
