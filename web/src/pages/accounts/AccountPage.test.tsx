import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfigQueryKey } from '@/api/@tanstack/react-query.gen';
import { render, screen, server, waitFor, within } from '@/test-utils';
import {
  accountsHandlers,
  configFixture,
  historyFixture,
  historyHandlers,
  seatFixture,
  trendsHandlers,
} from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { AccountPage } from './AccountPage';

/** Renders the page with the configuration the server would have injected. */
function renderPage(accountId = seatFixture.id): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(getConfigQueryKey(), configFixture);
  return render(<AccountPage accountId={accountId} />, client);
}

describe('AccountPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the account and its usage history', async () => {
    server.use(accountsHandlers.ok, historyHandlers.ok, trendsHandlers.ok);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Anthropic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'one@example.com' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Used share of each limit over time' })).toBeInTheDocument();
  });

  it('shows each usage window, the saved resets and whether the account takes traffic', async () => {
    // The fixtures count from NOW_MS; the page reads the clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    server.use(accountsHandlers.ok, historyHandlers.ok, trendsHandlers.ok);
    renderPage();

    const windows = within(await screen.findByRole('region', { name: 'Usage windows' }));
    expect(windows.getAllByRole('article').map(card => card.getAttribute('aria-label'))).toEqual([
      'Claude 5 Hour',
      'Claude 7 Day',
      'Claude 7 Day (Fable)',
    ]);
    // Once the history loads, the pace is read from it.
    expect(await windows.findAllByText(/over the last 1d/)).toHaveLength(2);

    expect(screen.getByRole('region', { name: 'Saved resets' })).toHaveTextContent('2 held, 1 usable now');
    expect(within(screen.getByRole('region', { name: 'Status' })).getByText('active')).toBeInTheDocument();
  });

  it('judges each window by its own average while the history cannot be read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    server.use(accountsHandlers.ok, historyHandlers.down, trendsHandlers.ok);
    renderPage();

    const windows = within(await screen.findByRole('region', { name: 'Usage windows' }));
    expect(await screen.findByText('Could not load the usage history.')).toBeInTheDocument();
    expect(windows.getAllByText(/the average since the window opened/)).toHaveLength(2);
  });

  it('asks for the last seven days', async () => {
    const asked: number[] = [];
    server.use(
      accountsHandlers.ok,
      trendsHandlers.ok,
      http.get('/api/v1/accounts/:accountId/history', ({ request }) => {
        const since = new URL(request.url).searchParams.get('since');
        asked.push(Date.now() - Date.parse(since ?? ''));
        return HttpResponse.json(historyFixture);
      })
    );
    renderPage();

    await screen.findByRole('img', { name: 'Used share of each limit over time' });

    // Seven days back, within the five-minute step the start is held to.
    const day = 24 * 3_600_000;
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeGreaterThanOrEqual(7 * day);
    expect(asked[0]).toBeLessThan(7 * day + 6 * 60_000);
  });

  it('says while the account and its history load', () => {
    server.use(accountsHandlers.pending, historyHandlers.pending, trendsHandlers.ok);
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.getAllByRole('status').map(status => status.textContent)).toEqual([
      'Loading the account…',
      'Loading the usage history…',
    ]);
  });

  it('says when the daemon cannot be reached', async () => {
    server.use(accountsHandlers.down, historyHandlers.down, trendsHandlers.ok);
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByRole('alert').map(alert => alert.textContent)).toEqual([
        'Could not reach oh-my-usage.',
        'Could not load the usage history.',
      ])
    );
  });

  it('says when the account is gone but still shows what was recorded', async () => {
    server.use(accountsHandlers.ok, historyHandlers.ok, trendsHandlers.ok);
    renderPage('00000000000000ff');

    expect(await screen.findByText('The gateway no longer reports this account.')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Used share of each limit over time' })).toBeInTheDocument();
  });

  it('says when nothing is recorded yet', async () => {
    server.use(accountsHandlers.ok, historyHandlers.empty, trendsHandlers.ok);
    renderPage();

    expect(await screen.findByText('No usage has been recorded in this period yet.')).toBeInTheDocument();
  });
});
