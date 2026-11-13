import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod/mini';
import {
  getAccountHistoryQueryKey,
  getTrafficQueryKey,
  listAccountsQueryKey,
  listUsageTrendsQueryKey,
} from '@/api/@tanstack/react-query.gen';
import { zAccountList, zTraffic } from '@/api/zod.gen';

/** The `streamEvents` operation. It is hand-routed, so there is no generated hook. */
export const EVENT_STREAM_URL = '/api/v1/stream';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/** `live` once an event has arrived; `reconnecting` after the stream dropped. */
export type StreamConnection = 'connecting' | 'live' | 'reconnecting';

/**
 * Subscribes to the server's event stream while mounted, once for the whole
 * app (the root route mounts it). Each event is validated against its
 * generated schema and written into the query cache, so pages keep reading
 * through their usual queries: `setQueryData` when the event is the whole
 * value, `invalidateQueries` when it only says something changed.
 */
export function useEventStream(): StreamConnection {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<StreamConnection>('connecting');

  useEffect(() => {
    let source: EventSource | undefined;
    let listeners: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let closed = false;

    const disconnect = (): void => {
      listeners?.abort();
      source?.close();
      source = undefined;
    };

    const onAccounts = (message: MessageEvent<string>): void => {
      const accounts = parse(zAccountList, 'accounts', message.data);
      if (!accounts) return;

      attempt = 0;
      setConnection('live');
      queryClient.setQueryData(listAccountsQueryKey(), accounts);
      // A poll may have recorded new usage: the charts read it again. A key
      // made without options matches the query whatever period it asks for.
      void queryClient.invalidateQueries({ queryKey: [{ _id: listUsageTrendsQueryKey()[0]._id }] });
      void queryClient.invalidateQueries({
        queryKey: [{ _id: getAccountHistoryQueryKey({ path: { accountId: '' } })[0]._id }],
      });
    };

    const onTraffic = (message: MessageEvent<string>): void => {
      const traffic = parse(zTraffic, 'traffic', message.data);
      if (traffic) queryClient.setQueryData(getTrafficQueryKey(), traffic);
    };

    // EventSource retries some failures itself and gives up on others; one
    // path with backoff and jitter handles both.
    const onError = (): void => {
      disconnect();
      if (closed) return;

      setConnection('reconnecting');
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      attempt += 1;
      timer = setTimeout(connect, delay * (0.5 + Math.random() / 2));
    };

    function connect(): void {
      listeners = new AbortController();
      source = new EventSource(EVENT_STREAM_URL);
      source.addEventListener('accounts', onAccounts, { signal: listeners.signal });
      source.addEventListener('traffic', onTraffic, { signal: listeners.signal });
      source.addEventListener('error', onError, { signal: listeners.signal });
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      disconnect();
    };
  }, [queryClient]);

  return connection;
}

/** Parses an event against its generated schema; a mismatch is logged and dropped. */
function parse<T extends z.ZodMiniType>(schema: T, event: string, data: string): z.infer<T> | undefined {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    json = undefined;
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(`streamEvents sent a ${event} event that does not match the spec`, parsed.error);
    return undefined;
  }

  return parsed.data;
}
