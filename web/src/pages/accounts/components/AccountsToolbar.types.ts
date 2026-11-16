import type { AccountOrder } from '@/lib/fleet';

export interface AccountsToolbarProps {
  /** How many accounts are listed. */
  count: number;

  /** The order the accounts are in. */
  order: AccountOrder;

  /** Called with the order picked. */
  onOrder: (order: AccountOrder) => void;
}
