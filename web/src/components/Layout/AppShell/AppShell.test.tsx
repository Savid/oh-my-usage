import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { AppShell } from './AppShell';

function renderShell(traffic: boolean, connection: 'live' | 'reconnecting' = 'reconnecting'): void {
  const root = createRootRoute({
    component: () => (
      <AppShell name="oh-my-usage" traffic={traffic} connection={connection}>
        <p>page body</p>
      </AppShell>
    ),
  });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(<RouterProvider router={router} />);
}

describe('AppShell', () => {
  it('frames the page with the product name, navigation and stream state', async () => {
    renderShell(true);

    expect(await screen.findByText('page body')).toBeInTheDocument();
    // The mark and the name lead home.
    expect(screen.getByRole('link', { name: 'oh-my-usage' })).toHaveAttribute('href', '/');
    const home = screen.getByRole('link', { name: 'Accounts' });
    expect(home).toHaveAttribute('href', '/');
    // The current page is marked by more than colour: a bar under its name.
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(home).toHaveClass('border-accent');
    expect(screen.getByRole('link', { name: 'Traffic' })).toHaveClass('border-transparent');
    expect(screen.getByRole('link', { name: 'Traffic' })).toHaveAttribute('href', '/traffic');
    expect(screen.getByText('reconnecting')).toHaveAttribute('data-tone', 'warn');
  });

  it('links the Traffic page only when there is a broker to read it from', async () => {
    renderShell(false);

    expect(await screen.findByText('page body')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Traffic' })).not.toBeInTheDocument();
  });

  it('says nothing about a stream that is up', async () => {
    renderShell(true, 'live');

    expect(await screen.findByText('page body')).toBeInTheDocument();
    expect(screen.queryByText('live')).not.toBeInTheDocument();
    expect(screen.queryByText('reconnecting')).not.toBeInTheDocument();
  });
});
