import type { JSX } from 'react';
import { Link } from '@tanstack/react-router';
import { StatusBadge } from '@/components/Feedback/StatusBadge';
import type { StatusTone } from '@/components/Feedback/StatusBadge/StatusBadge.types';
import type { StreamConnection } from '@/hooks/useEventStream';
import type { AppShellProps } from './AppShell.types';

// The stream is only spoken of when it is down: a page that is updating
// needs no badge to say so, and one that is not must not look current.
const connections: Record<StreamConnection, { label: string; tone: StatusTone } | undefined> = {
  connecting: undefined,
  live: undefined,
  reconnecting: { label: 'reconnecting', tone: 'warn' },
};

/** Page frame: top bar with the product name, navigation and a warning when the stream is down, then the page. */
export function AppShell({ name, traffic, connection, children }: AppShellProps): JSX.Element {
  const lost = connections[connection];

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-10 items-center gap-4 border-b border-border bg-surface px-3">
        <span className="text-body font-semibold text-accent">{name ?? '\u00a0'}</span>
        <nav className="flex flex-1 gap-4 text-caption">
          <Link
            to="/"
            activeProps={{ className: 'text-foreground underline underline-offset-4' }}
            inactiveProps={{ className: 'text-muted hover:text-foreground' }}
          >
            Accounts
          </Link>
          {traffic && (
            <Link
              to="/traffic"
              activeProps={{ className: 'text-foreground underline underline-offset-4' }}
              inactiveProps={{ className: 'text-muted hover:text-foreground' }}
            >
              Traffic
            </Link>
          )}
        </nav>
        {lost && <StatusBadge tone={lost.tone}>{lost.label}</StatusBadge>}
      </header>
      <main className="flex-1 p-2 sm:p-3">{children}</main>
    </div>
  );
}
