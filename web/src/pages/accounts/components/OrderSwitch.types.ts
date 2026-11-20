import type { AccountOrder } from '@/lib/fleet';

export interface OrderSwitchProps {
  /** The order the accounts are in. */
  order: AccountOrder;

  /** Called with the order picked. */
  onOrder: (order: AccountOrder) => void;
}
