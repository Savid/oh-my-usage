import type { JSX, ReactNode } from 'react';
import clsx from 'clsx';

interface BlockProps {
  children: ReactNode;
  className?: string;
  /** Names the block as a region a keyboard can reach, for one that scrolls. */
  label?: string;
}

/** The frame every Foundations block renders in, on the page background of the toolbar's theme. */
export function Block({ children, className, label }: BlockProps): JSX.Element {
  const region = label === undefined ? {} : { role: 'region', 'aria-label': label, tabIndex: 0 };
  return (
    <div
      {...region}
      className={clsx('my-6 rounded-md bg-background p-4 font-mono text-body text-foreground', className)}
    >
      {children}
    </div>
  );
}
