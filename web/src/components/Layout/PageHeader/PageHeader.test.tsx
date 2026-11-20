import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { AppShell } from '@/components/Layout/AppShell';
import { PageHeader } from './PageHeader';

function renderHeader(connection: 'live' | 'reconnecting' = 'live'): void {
  const root = createRootRoute({
    component: () => (
      <AppShell name="oh-my-usage" connection={connection}>
        <PageHeader>
          <p>first line</p>
        </PageHeader>
      </AppShell>
    ),
  });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/traffic'] }) });
  render(<RouterProvider router={router} />);
}

describe('PageHeader', () => {
  it("sets the page's first line beside the mark, which leads home", async () => {
    renderHeader();

    expect(await screen.findByText('first line')).toBeInTheDocument();
    // The mark stands for the name, which is not written out.
    expect(screen.getByRole('link', { name: 'oh-my-usage' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('oh-my-usage')).not.toBeInTheDocument();
    // There is no bar of pages.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('live')).not.toBeInTheDocument();
  });

  it('says when the stream is down', async () => {
    renderHeader('reconnecting');

    expect(await screen.findByText('reconnecting')).toHaveAttribute('data-tone', 'warn');
  });

  it('leads home by a plain name outside the frame', async () => {
    const root = createRootRoute({ component: () => <PageHeader /> });
    const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });
});
