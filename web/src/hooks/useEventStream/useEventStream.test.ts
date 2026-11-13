import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTrafficQueryKey, listAccountsQueryKey, listUsageTrendsQueryKey } from '@/api/@tanstack/react-query.gen';
import { act, FakeEventSource, renderHook } from '@/test-utils';
import { accountsFixture, trafficFixture, trendsFixture } from '@/test-utils/handlers';
import { EVENT_STREAM_URL, useEventStream } from './useEventStream';

describe('useEventStream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('goes live and writes each accounts event into the accounts query', () => {
    const { result, client } = renderHook(() => useEventStream());
    const source = FakeEventSource.latest();

    expect(source.url).toBe(EVENT_STREAM_URL);
    expect(result.current).toBe('connecting');

    act(() => source.emit('accounts', accountsFixture));

    expect(result.current).toBe('live');
    expect(client.getQueryData(listAccountsQueryKey())).toEqual(accountsFixture);
  });

  it('has the charts read the usage again after each accounts event', () => {
    const { client } = renderHook(() => useEventStream());
    const key = listUsageTrendsQueryKey({ query: { since: '2026-09-19T12:00:00.000Z' } });
    client.setQueryData(key, trendsFixture);

    act(() => FakeEventSource.latest().emit('accounts', accountsFixture));

    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('writes each traffic event into the traffic query', () => {
    const { result, client } = renderHook(() => useEventStream());

    act(() => FakeEventSource.latest().emit('traffic', trafficFixture));

    expect(client.getQueryData(getTrafficQueryKey())).toEqual(trafficFixture);
    // Only accounts say the stream is live: they are sent with or without a broker.
    expect(result.current).toBe('connecting');
  });

  it('ignores an event that does not match the spec', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, client } = renderHook(() => useEventStream());

    act(() => FakeEventSource.latest().emit('accounts', { accounts: 'exploded' }));

    expect(result.current).toBe('connecting');
    expect(client.getQueryData(listAccountsQueryKey())).toBeUndefined();
    expect(logged).toHaveBeenCalledOnce();
  });

  it('reconnects with backoff after the stream drops', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEventStream());
    const first = FakeEventSource.latest();

    act(() => first.fail());

    expect(result.current).toBe('reconnecting');
    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1000));

    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => FakeEventSource.latest().emit('accounts', accountsFixture));

    expect(result.current).toBe('live');
  });

  it('closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useEventStream());
    const source = FakeEventSource.latest();

    unmount();

    expect(source.closed).toBe(true);
  });
});
