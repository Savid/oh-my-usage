import type { JSX } from 'react';
import clsx from 'clsx';
import type { StatusBadgeProps, StatusTone } from './StatusBadge.types';

// The dot carries the tone. The word carries it too when something needs
// attention, and stays quiet when all is well.
const dotStyles: Record<StatusTone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  neutral: 'text-muted',
};

const labelStyles: Record<StatusTone, string> = {
  ok: 'text-muted',
  warn: 'text-warn',
  danger: 'text-danger',
  neutral: 'text-muted',
};

export function StatusBadge({ tone = 'neutral', children }: StatusBadgeProps): JSX.Element {
  return (
    <span
      data-tone={tone}
      className={clsx(
        'inline-flex items-center gap-1.5 text-micro tracking-caps whitespace-nowrap uppercase',
        labelStyles[tone]
      )}
    >
      {/* Drawn in currentColor, so forced colours keep the dot. */}
      <svg aria-hidden="true" viewBox="0 0 8 8" className={clsx('size-1.5 shrink-0 fill-current', dotStyles[tone])}>
        <circle cx="4" cy="4" r="4" />
      </svg>
      {children}
    </span>
  );
}
