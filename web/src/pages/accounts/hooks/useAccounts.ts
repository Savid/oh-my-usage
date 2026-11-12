import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AccountList, ListAccountsError } from '@/api';
import { listAccountsOptions } from '@/api/@tanstack/react-query.gen';

/**
 * How often the list is refetched. The event stream writes each poll into the
 * cache; this slower refetch is what notices that the daemon itself is gone.
 */
const REFRESH_MS = 60_000;

/** The accounts and the health of their sources, kept fresh by the event stream. */
export function useAccounts(): UseQueryResult<AccountList, ListAccountsError> {
  return useQuery({ ...listAccountsOptions(), refetchInterval: REFRESH_MS });
}
