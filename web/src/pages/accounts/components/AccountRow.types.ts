import type { Account, UsageTrend } from '@/api';

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

  /**
   * The level of the row's heading, to fit the page's outline.
   * @default 3
   */
  headingLevel?: 2 | 3;
}
