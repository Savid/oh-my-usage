import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfigQueryKey } from '@/api/@tanstack/react-query.gen';
import { fireEvent, render, screen, server, waitFor, within } from '@/test-utils';
import { accountsHandlers, configFixture, trafficHandlers, trendsHandlers } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { AccountsPage } from './AccountsPage';

/** Renders the page with the configuration the server would have injected. */
function renderPage(controls = true): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(getConfigQueryKey(), { ...configFixture, controls });
  return render(<AccountsPage />, client);
}

describe('AccountsPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on one total per provider, then a line per account', async () => {
    // The fixtures' reset times count from NOW_MS; the page reads the clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    server.use(accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.ok);
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();

    const totals = within(await screen.findByRole('region', { name: 'Totals' }));
    // Two Claude seats with 76% and 19% of the week used; one Codex seat with 66%.
    expect(totals.getByRole('article', { name: 'Anthropic 7 Day' })).toHaveTextContent(
      'Anthropic7 Day · 2 seats48%usednext reset 21h'
    );
    expect(totals.getByRole('article', { name: 'OpenAI Codex 7 days' })).toHaveTextContent('66%usedresets in 4d 14h');
    // The API key reports no usage, so it has no total.
    expect(totals.getAllByRole('article')).toHaveLength(2);

    const rows = within(screen.getByRole('region', { name: 'Every account' })).getAllByRole('article');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAccessibleName('one@example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('draws each row over its recorded usage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    server.use(accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.ok);
    const { container } = renderPage();

    const every = await screen.findByRole('region', { name: 'Every account' });
    // Three accounts report usage and have history; the API key has neither.
    await waitFor(() => expect(every.querySelectorAll('[data-chart="history"]')).toHaveLength(3));
    expect(every.querySelectorAll('[data-chart="none"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-chart]').length).toBeGreaterThan(4);
  });

  it('offers pause controls only when a broker is configured', async () => {
    server.use(accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.ok);
    const { unmount } = renderPage(true);

    // Two of the four accounts are pausable and not paused; one is paused.
    expect(await screen.findAllByRole('button', { name: 'Pause' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();

    unmount();
    renderPage(false);

    expect(await screen.findByRole('region', { name: 'Every account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Pause|Resume)$/ })).not.toBeInTheDocument();
  });

  it('shows what is passing through the gateway when a broker is configured', async () => {
    server.use(accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.ok);
    renderPage();

    const traffic = await screen.findByRole('region', { name: 'Traffic' });
    expect(traffic).toHaveTextContent('Burn at API prices');
    // One seat is priced, so the week is set against what it costs.
    expect(traffic).toHaveTextContent('Value · last 7 days');
  });

  it('opens on a line of figures for the fleet', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    server.use(accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.ok);
    renderPage();

    const fleet = await screen.findByRole('region', { name: 'Fleet' });
    // Each name comes before its figure for assistive technology; the figure is drawn first.
    expect(fleet).toHaveTextContent('accounts4');
    expect(fleet).toHaveTextContent('running dry▲1');
    expect(fleet).toHaveTextContent('for 1 priced$200/mo');
    expect(fleet).toHaveTextContent('gateway read 5s ago');
  });

  it('orders the accounts as asked', async () => {
    server.use(accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.ok);
    renderPage();

    const every = await screen.findByRole('region', { name: 'Every account' });
    const names = (): string[] =>
      within(every)
        .getAllByRole('article')
        .map(row => row.getAttribute('aria-labelledby') ?? '');

    fireEvent.click(within(every).getByRole('button', { name: 'Listed' }));
    expect(within(every).getByRole('button', { name: 'Listed' })).toHaveAttribute('aria-pressed', 'true');
    expect(names()).toEqual([
      'account-00000000000000a1',
      'account-00000000000000a2',
      'account-00000000000000c1',
      'account-00000000000000d1',
    ]);

    fireEvent.click(within(every).getByRole('button', { name: 'Used' }));
    // The paused seat's 5-hour window is spent, but it lives on its week: 19%.
    expect(names()).toEqual([
      'account-00000000000000a1',
      'account-00000000000000c1',
      'account-00000000000000a2',
      'account-00000000000000d1',
    ]);
  });

  it('says nothing about traffic without a broker', async () => {
    server.use(accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.unavailable);
    renderPage(false);

    expect(await screen.findByRole('region', { name: 'Every account' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Traffic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when the traffic cannot be read', async () => {
    server.use(accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.down);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the traffic.');
    expect(screen.getByRole('region', { name: 'Every account' })).toBeInTheDocument();
  });

  it('says while it is loading', () => {
    server.use(accountsHandlers.pending, trendsHandlers.ok, trafficHandlers.ok);
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading the accounts…');
  });

  it('says when the daemon cannot be reached', async () => {
    server.use(accountsHandlers.down, trendsHandlers.ok, trafficHandlers.ok);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach oh-my-usage.');
  });

  it('keeps the last accounts and says so when the gateway is unreachable', async () => {
    server.use(accountsHandlers.unreachable, trendsHandlers.ok, trafficHandlers.ok);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway cannot be reached');
    expect(within(screen.getByRole('region', { name: 'Every account' })).getAllByRole('article')).toHaveLength(4);
  });

  it('says when the gateway reports no accounts', async () => {
    server.use(accountsHandlers.empty, trendsHandlers.ok, trafficHandlers.ok);
    renderPage();

    expect(await screen.findByText('The gateway reports no accounts.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Totals' })).not.toBeInTheDocument();
  });

  it('falls back to current levels when the history cannot be read', async () => {
    server.use(accountsHandlers.ok, trendsHandlers.down, trafficHandlers.ok);
    const { container } = renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the usage history. The rows show current levels only.'
    );
    const every = screen.getByRole('region', { name: 'Every account' });
    expect(every.querySelector('[data-chart="history"]')).not.toBeInTheDocument();
    expect(every.querySelectorAll('[data-chart="level"]')).toHaveLength(3);
    expect(container).toBeInTheDocument();
  });
});
