import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfigQueryKey } from '@/api/@tanstack/react-query.gen';
import { render, screen, server, waitFor, within } from '@/test-utils';
import { accountsHandlers, configFixture, trendsHandlers } from '@/test-utils/handlers';
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
    server.use(accountsHandlers.ok, trendsHandlers.ok);
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
    expect(screen.getByText(/omp 18\.19\.0/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('draws each row over its recorded usage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    server.use(accountsHandlers.ok, trendsHandlers.ok);
    const { container } = renderPage();

    await screen.findByRole('region', { name: 'Every account' });
    // Three accounts report usage and have history; the API key has neither.
    await waitFor(() => expect(container.querySelectorAll('[data-chart="history"]')).toHaveLength(3));
    expect(container.querySelectorAll('[data-chart="none"]')).toHaveLength(1);
  });

  it('offers pause controls and explains them only when a broker is configured', async () => {
    server.use(accountsHandlers.ok, trendsHandlers.ok);
    const { unmount } = renderPage(true);

    // Two of the four accounts are pausable and not paused; one is paused.
    expect(await screen.findAllByRole('button', { name: 'Pause' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByText(/A paused account is used last, not never/)).toBeInTheDocument();

    unmount();
    renderPage(false);

    expect(await screen.findByRole('region', { name: 'Every account' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/A paused account is used last/)).not.toBeInTheDocument();
  });

  it('says while it is loading', () => {
    server.use(accountsHandlers.pending, trendsHandlers.ok);
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading the accounts…');
  });

  it('says when the daemon cannot be reached', async () => {
    server.use(accountsHandlers.down, trendsHandlers.ok);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach oh-my-usage.');
  });

  it('keeps the last accounts and says so when the gateway is unreachable', async () => {
    server.use(accountsHandlers.unreachable, trendsHandlers.ok);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway cannot be reached');
    expect(within(screen.getByRole('region', { name: 'Every account' })).getAllByRole('article')).toHaveLength(4);
  });

  it('says when the gateway reports no accounts', async () => {
    server.use(accountsHandlers.empty, trendsHandlers.ok);
    renderPage();

    expect(await screen.findByText('The gateway reports no accounts.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Totals' })).not.toBeInTheDocument();
    expect(screen.queryByText(/A paused account is used last/)).not.toBeInTheDocument();
  });

  it('falls back to current levels when the history cannot be read', async () => {
    server.use(accountsHandlers.ok, trendsHandlers.down);
    const { container } = renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the usage history. The rows show current levels only.'
    );
    expect(container.querySelector('[data-chart="history"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-chart="level"]')).toHaveLength(3);
  });
});
