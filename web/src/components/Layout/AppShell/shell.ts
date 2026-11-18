import { createContext } from 'react';
import type { StreamConnection } from '@/hooks/useEventStream';

/** What the frame knows that a page's header shows: the daemon's name and the stream's state. */
export interface ShellState {
  /** The daemon's display name, which names the mark's link; undefined until known. */
  name: string | undefined;
  /** The event stream's state; a header says so when it is down. */
  connection: StreamConnection;
}

/** Set by `AppShell`; outside it, nothing is known and the stream is taken as up. */
export const ShellContext = createContext<ShellState>({ name: undefined, connection: 'live' });
