import type { JSX } from 'react';
import clsx from 'clsx';
import { ACCOUNT_ORDERS } from '@/lib/fleet';
import type { AccountsToolbarProps } from './AccountsToolbar.types';

/** The head of the account cards: what they are, how many, and the order they are in. */
export function AccountsToolbar({ count, order, onOrder }: AccountsToolbarProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-1 pt-2">
      <h2 className="text-body font-semibold tracking-caps uppercase">Accounts</h2>
      <span className="text-caption text-muted tabular-nums">{count}</span>
      <div role="group" aria-label="Order accounts by" className="ml-auto flex items-center gap-1">
        <span aria-hidden="true" className="mr-1 text-micro tracking-caps text-muted uppercase">
          Order
        </span>
        {ACCOUNT_ORDERS.map(entry => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={order === entry.id}
            onClick={() => onOrder(entry.id)}
            className={clsx(
              'h-6 rounded-sm border px-2 text-micro tracking-caps uppercase',
              order === entry.id
                ? 'border-accent text-foreground'
                : 'border-border text-muted hover:border-border-strong hover:text-foreground'
            )}
          >
            {entry.name}
          </button>
        ))}
      </div>
    </div>
  );
}
