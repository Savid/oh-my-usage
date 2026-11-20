import type { JSX } from 'react';
import clsx from 'clsx';
import { ACCOUNT_ORDERS, type AccountOrder } from '@/lib/fleet';
import type { OrderSwitchProps } from './OrderSwitch.types';

// Where the thumb sits under each order: one segment of three along.
const thumbClasses: Record<AccountOrder, string> = {
  priority: 'translate-x-0',
  used: 'translate-x-full',
  listed: 'translate-x-2/1',
};

/**
 * The order the accounts are in, picked on a segmented control whose thumb
 * slides to the choice. It sits at the end of the accounts panel's head.
 */
export function OrderSwitch({ order, onOrder }: OrderSwitchProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="hidden text-micro tracking-caps text-muted uppercase sm:inline">
        Order
      </span>
      <div className="rounded-md bg-raised p-0.5">
        <div role="group" aria-label="Order accounts by" className="relative grid grid-cols-3">
          {/* The thumb: one segment wide, slid to the one picked. */}
          <span
            aria-hidden="true"
            className={clsx(
              'absolute inset-y-0 left-0 w-1/3 rounded-sm bg-surface ring-1 ring-border-strong transition-transform duration-200 motion-reduce:transition-none',
              thumbClasses[order]
            )}
          />
          {ACCOUNT_ORDERS.map(entry => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={order === entry.id}
              onClick={() => onOrder(entry.id)}
              className={clsx(
                'relative h-6 rounded-sm px-2.5 text-micro tracking-caps uppercase transition-colors',
                order === entry.id ? 'text-foreground' : 'text-muted hover:text-foreground'
              )}
            >
              {entry.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
