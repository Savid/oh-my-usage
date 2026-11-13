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
const tab = 'flex h-full items-center gap-1.5 border-b-2 px-2';
const tabProps = {
  activeProps: { className: `${tab} border-accent text-foreground` },
  inactiveProps: { className: `${tab} border-transparent text-muted hover:text-foreground` },
};

// Drawn in the text's colour on a 16-unit grid, beside a label that names the page.
const icon = {
  'aria-hidden': true,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Two people: the seats traffic is shared between. */
function AccountsIcon({ current }: { current: boolean }): JSX.Element {
  return (
    <svg {...icon} className={current ? 'size-4 text-accent' : 'size-4'}>
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 13.5c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4" />
      <path d="M10.5 2.7a2.5 2.5 0 0 1 0 4.6M12 9.9c1.5.6 2.5 1.9 2.5 3.6" />
    </svg>
  );
}

/** Three bars, as the Traffic page draws what passed. */
function TrafficIcon({ current }: { current: boolean }): JSX.Element {
  return (
    <svg {...icon} className={current ? 'size-4 text-accent' : 'size-4'}>
      <path d="M3 13.5v-4M8 13.5v-11M13 13.5V6" />
    </svg>
  );
}

/**
 * Page frame: a top bar with the product's mark, which leads home, the pages
 * as tabs, and a warning when the stream is down; then the page.
 */
export function AppShell({ name, traffic, connection, children }: AppShellProps): JSX.Element {
  const lost = connections[connection];

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-11 items-center gap-3 border-b border-border bg-surface px-3">
        {/* The mark stands for the name, so the link is named by it. */}
        <Link to="/" aria-label={name ?? 'Home'} className="flex items-center">
          <Logo />
        </Link>
        <nav className="flex h-full flex-1 gap-1 text-body">
          <Link to="/" {...tabProps}>
            {({ isActive }) => (
              <>
                <AccountsIcon current={isActive} />
                Accounts
              </>
            )}
          </Link>
          {traffic && (
            <Link to="/traffic" {...tabProps}>
              {({ isActive }) => (
                <>
                  <TrafficIcon current={isActive} />
                  Traffic
                </>
              )}
            </Link>
          )}
        </nav>
        {lost && <StatusBadge tone={lost.tone}>{lost.label}</StatusBadge>}
      </header>
      <main className="flex-1 p-2 sm:p-3">{children}</main>
    </div>
  );
}
