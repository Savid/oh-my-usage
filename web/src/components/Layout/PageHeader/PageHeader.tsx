import { use, type JSX } from 'react';
import { Link } from '@tanstack/react-router';
import { Logo } from '@/components/Brand/Logo';
import { ShellContext } from '@/components/Layout/AppShell/shell';
import { StatusBadge } from '@/components/Feedback/StatusBadge';
import type { StatusTone } from '@/components/Feedback/StatusBadge/StatusBadge.types';
import type { StreamConnection } from '@/hooks/useEventStream';
import type { PageHeaderProps } from './PageHeader.types';

// The stream is only spoken of when it is down: a page that is updating
// needs no badge to say so, and one that is not must not look current.
const connections: Record<StreamConnection, { label: string; tone: StatusTone } | undefined> = {
  connecting: undefined,
  live: undefined,
  reconnecting: { label: 'reconnecting', tone: 'warn' },
};

/**
 * A page's first line: the product's mark, which leads home, then the page's
 * own line beside it, and a warning when the stream is down. There is no bar
 * of pages: the homepage leads to the rest.
 */
export function PageHeader({ children }: PageHeaderProps): JSX.Element {
  const { name, connection } = use(ShellContext);
  const lost = connections[connection];

  return (
    <header className="flex min-h-8 items-center gap-3 px-1">
      {/* The mark stands for the name, so the link is named by it. */}
      <Link to="/" aria-label={name ?? 'Home'} className="flex shrink-0 items-center">
        <Logo />
      </Link>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">{children}</div>
      {lost && <StatusBadge tone={lost.tone}>{lost.label}</StatusBadge>}
    </header>
  );
}
