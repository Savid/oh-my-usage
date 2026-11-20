import type { JSX } from 'react';
import clsx from 'clsx';
import { ordinal, type Priority } from '@/lib/priority';
import type { PriorityPillProps } from './PriorityPill.types';

// Information, not trouble: blue for an account the gateway picks, grey for one it holds back.
const priorityClasses: Record<Priority['standing'], string> = {
  ranked: 'bg-info-subtle text-info',
  later: 'bg-raised text-muted',
  last: 'bg-raised text-muted',
};

/**
 * Where the gateway would pick an account for a new conversation, and why, in
 * a few quiet words on a tinted pill: `1st · 30% left`, `later · 5h nearly
 * full`, `last`.
 */
export function PriorityPill({ priority, reason = 'always' }: PriorityPillProps): JSX.Element {
  return (
    <span
      data-testid="priority"
      data-standing={priority.standing}
      className={clsx('shrink-0 rounded-sm px-1.5 text-micro whitespace-nowrap', priorityClasses[priority.standing])}
    >
      <span className="sr-only">Gateway pick: </span>
      <span className="font-semibold">{priority.rank === undefined ? priority.standing : ordinal(priority.rank)}</span>
      {reason !== 'never' && (
        <span className={clsx(reason === 'wide' && 'sr-only lg:not-sr-only')}> · {priority.reason}</span>
      )}
    </span>
  );
}
