import type { TrafficClient } from '@/api';

export interface TrafficClientsProps {
  /** The last week by client, application and provider, the costliest first. */
  clients: readonly TrafficClient[];
}
