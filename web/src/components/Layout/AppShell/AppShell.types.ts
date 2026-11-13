import type { ReactNode } from 'react';
import type { StreamConnection } from '@/hooks/useEventStream';

export interface AppShellProps {
  /** The daemon's display name from its configuration; undefined until known. */
  name: string | undefined;

  /** Whether the daemon reads traffic from a broker; the Traffic page is linked only then. */
  traffic: boolean;

  /** The event stream's state; the top bar says so when it is down. */
  connection: StreamConnection;

  /** The current page. */
  children: ReactNode;
}
