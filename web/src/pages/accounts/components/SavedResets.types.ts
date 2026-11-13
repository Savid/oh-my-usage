import type { Limit, Resets } from '@/api';

export interface SavedResetsProps {
  /** The account's saved limit resets; undefined when the provider reports none. */
  resets: Resets | undefined;

  /** The account's limits, to name what each reset would clear. */
  limits: readonly Limit[];

  /** The current time in milliseconds, for how long each has before it expires. */
  now: number;
}
