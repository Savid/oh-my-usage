import type { Account, UsageTrend } from '@/api';
import type { Priority } from '@/lib/priority';

export interface AccountRowProps {
  /** The account to show. */
  account: Account;

  /** Recorded usage, for the chart the row is drawn over; other accounts' trends are ignored. */
  trends: readonly UsageTrend[];

  /** The earliest the chart may start, in milliseconds; it starts later if the account's history does. */
  start: number;

  /** The current time in milliseconds, for ages and countdowns. */
  now: number;

  /** Whether a broker is configured, so the account can be paused. */
  controls: boolean;

  /** Where the gateway would pick it, and why; absent for an account it does not pick. */
  priority?: Priority;
}
