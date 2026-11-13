import type { JSX } from 'react';
import { Link } from '@tanstack/react-router';
import { Logo } from '@/components/Brand/Logo';
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

// The page you are on is marked by a bar under its name, not by colour alone.
const tab = 'flex h-full items-center border-b-2 px-1';
const tabProps = {
  activeProps: { className: `${tab} border-accent text-foreground` },
  inactiveProps: { className: `${tab} border-transparent text-muted hover:text-foreground` },
};

/**
 * Page frame: a top bar with the product's mark and name, which lead home,
 * the pages as tabs, and a warning when the stream is down; then the page.
 */
export function AppShell({ name, traffic, connection, children }: AppShellProps): JSX.Element {
  const lost = connections[connection];

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-11 items-center gap-5 border-b border-border bg-surface px-3">
        <Link to="/" className="flex items-center gap-2 text-body font-semibold text-foreground">
          <Logo />
          {name ?? '\u00a0'}
        </Link>
        <nav className="flex h-full flex-1 gap-3 text-caption">
          <Link to="/" {...tabProps}>
            Accounts
          </Link>
          {traffic && (
            <Link to="/traffic" {...tabProps}>
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
