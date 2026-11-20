import type { Account, UsageSample } from '@/api';
import type { Priority } from '@/lib/priority';

export interface AccountSummaryProps {
  /** The account to sum up. */
  account: Account;

  /** Where the gateway would pick it, and why; absent for an account it does not pick. */
  priority?: Priority;

  /** Whether a broker is configured, so the account can be paused. */
  controls: boolean;

  /** The account's recorded usage, for each window's pace. Empty when there is none. */
  samples: readonly UsageSample[];

  /** The current time in milliseconds. */
  now: number;
}
