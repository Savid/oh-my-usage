import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Account, AccountList } from '@/api';
import { listAccountsQueryKey, setAccountPausedMutation } from '@/api/@tanstack/react-query.gen';
import { problemDetail } from '@/lib/problem';

/** An account's pause, as its control shows it. */
export interface Pause {
  /** Paused, or about to be: the control shows the change as soon as it is pressed, and back if the broker refuses. */
  paused: boolean;
  /** The broker has not answered yet. */
  pending: boolean;
  /** Pauses the account, or resumes it. */
  toggle: () => void;
  /** Why the last press did nothing, in a sentence. */
  error?: string;
}

/** Pauses an account or resumes it, through the broker. */
export function usePause(account: Account): Pause {
  const queryClient = useQueryClient();
  const pause = useMutation({
    ...setAccountPausedMutation(),
    // The answer is the account as the broker now reports it; the event
    // stream sends the same after its next poll.
    onSuccess: updated => {
      queryClient.setQueryData(listAccountsQueryKey(), (list: AccountList | undefined) =>
        list ? { ...list, accounts: list.accounts.map(entry => (entry.id === updated.id ? updated : entry)) } : list
      );
    },
  });

  const paused = pause.isPending ? pause.variables.body.paused : account.paused;
  return {
    paused,
    pending: pause.isPending,
    toggle: () => pause.mutate({ path: { accountId: account.id }, body: { paused: !paused } }),
    error: pause.isError
      ? `${account.paused ? 'Could not resume the account' : 'Could not pause the account'}: ${problemDetail(pause.error, 'the server did not answer')}`
      : undefined,
  };
}
