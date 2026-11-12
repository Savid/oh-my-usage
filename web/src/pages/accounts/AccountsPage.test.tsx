import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { getConfigQueryKey } from '@/api/@tanstack/react-query.gen';
import { render, screen, server, within } from '@/test-utils';
import { accountsHandlers, configFixture } from '@/test-utils/handlers';
import { AccountsPage } from './AccountsPage';

/** Renders the page with the configuration the server would have injected. */
function renderPage(controls = true): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(getConfigQueryKey(), { ...configFixture, controls });
  return render(<AccountsPage />, client);
}

describe('AccountsPage', () => {
  it('groups the accounts by provider', async () => {
    server.use(accountsHandlers.ok);
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();

    const anthropic = await screen.findByRole('region', { name: 'Anthropic' });
    expect(within(anthropic).getAllByRole('article')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'OpenAI Codex' })).getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'OpenRouter' })).toBeInTheDocument();
    expect(screen.getByText('omp gateway 18.19.0')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers pause controls and explains them only when a broker is configured', async () => {
    server.use(accountsHandlers.ok);
    const { unmount } = renderPage(true);

    // Two of the four accounts are pausable and not paused; one is paused.
    expect(await screen.findAllByRole('button', { name: 'Pause' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByText(/A paused account is used last, not never/)).toBeInTheDocument();

    unmount();
    renderPage(false);

    expect(await screen.findByRole('region', { name: 'Anthropic' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/A paused account is used last/)).not.toBeInTheDocument();
  });

  it('says while it is loading', () => {
    server.use(accountsHandlers.pending);
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading the accounts…');
  });

  it('says when the daemon cannot be reached', async () => {
    server.use(accountsHandlers.down);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach oh-my-usage.');
  });

  it('keeps the last accounts and says so when the gateway is unreachable', async () => {
    server.use(accountsHandlers.unreachable);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway cannot be reached');
    expect(screen.getAllByRole('article')).toHaveLength(4);
  });

  it('says when the gateway reports no accounts', async () => {
    server.use(accountsHandlers.empty);
    renderPage();

    expect(await screen.findByText('The gateway reports no accounts.')).toBeInTheDocument();
    expect(screen.queryByText(/A paused account is used last/)).not.toBeInTheDocument();
  });
});
