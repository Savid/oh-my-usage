import type { AccountList } from '@/api';

export interface SourceAlertsProps {
  /** The account list, whose `gateway` and `broker` say how fresh it is. */
  list: AccountList;

  /** True when the last refetch failed, so `list` is what the daemon sent before. */
  stale: boolean;

  /** The current time in milliseconds, for the age of the data. */
  now: number;
}
