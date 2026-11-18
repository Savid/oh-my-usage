import type { JSX } from 'react';
import { ShellContext } from './shell';
import type { AppShellProps } from './AppShell.types';

/**
 * Page frame: no bar of its own. Each page opens on a `PageHeader`, which
 * carries the product's mark, leading home, beside the page's own first
 * line, and a warning when the stream is down; the frame hands it what it
 * needs for that.
 */
export function AppShell({ name, connection, children }: AppShellProps): JSX.Element {
  return (
    <ShellContext value={{ name, connection }}>
      <main className="min-h-full p-2 sm:p-3">{children}</main>
    </ShellContext>
  );
}
