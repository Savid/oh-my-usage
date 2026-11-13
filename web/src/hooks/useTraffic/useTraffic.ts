import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { GetTrafficError, Traffic } from '@/api';
import { getTrafficOptions } from '@/api/@tanstack/react-query.gen';

/**
 * How often the traffic is refetched. The event stream writes each collection
 * into the cache; this slower refetch is what notices that the daemon is gone.
 */
const REFRESH_MS = 60_000;

/** What is passing through the gateway, kept fresh by the event stream. */
export function useTraffic(): UseQueryResult<Traffic, GetTrafficError> {
  return useQuery({ ...getTrafficOptions(), refetchInterval: REFRESH_MS });
}
