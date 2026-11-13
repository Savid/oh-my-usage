import type { Limit, UsageSample } from '@/api';

export interface LimitCardProps {
  /** The usage window to show. */
  limit: Limit;

  /** The account's provider, whose colour the gauge wears. */
  provider: string;

  /** The account's recorded usage, of any limit; the recent pace is read from it. Empty when there is none. */
  samples: readonly UsageSample[];

  /** The current time in milliseconds. */
  now: number;
}
