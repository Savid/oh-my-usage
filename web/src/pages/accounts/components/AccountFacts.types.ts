import type { Account } from '@/api';

export interface AccountFactsProps {
  /** The account to describe. */
  account: Account;

  /** The current time in milliseconds, for how long blocks last and how old the usage is. */
  now: number;
}
