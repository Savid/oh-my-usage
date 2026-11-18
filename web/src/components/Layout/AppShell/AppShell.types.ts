import type { ReactNode } from 'react';
import type { StreamConnection } from '@/hooks/useEventStream';

export interface AppShellProps {
  /** The daemon's display name from its configuration, which names the mark's link; undefined until known. */
  name: string | undefined;

  /** The event stream's state; each page's header says so when it is down. */
  connection: StreamConnection;

  /** The current page, which opens on a `PageHeader`. */
  children: ReactNode;
}
