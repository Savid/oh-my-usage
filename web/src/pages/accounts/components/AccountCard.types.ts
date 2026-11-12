import type { Account } from '@/api';

export interface AccountCardProps {
  /** The account to show. */
  account: Account;

  /** The current time in milliseconds, for ages and countdowns. */
  now: number;

  /** Whether a broker is configured, so the account can be paused. */
  controls: boolean;

  /**
   * The level of the card's heading, to fit the page's outline.
   * @default 3
   */
  headingLevel?: 2 | 3;
}
