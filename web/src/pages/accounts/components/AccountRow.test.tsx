import { describe, expect, it } from 'vitest';
import type { AccountList } from '@/api';
import { listAccountsQueryKey } from '@/api/@tanstack/react-query.gen';
import { fireEvent, render, screen, server, waitFor, within } from '@/test-utils';
import {
  accountsFixture,
  keyFixture,
  pausedSeatFixture,
  pauseHandlers,
  seatFixture,
  strayFixture,
  trendsFixture,
} from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';
import { AccountRow } from './AccountRow';

const base = { trends: trendsFixture.trends, start: NOW_MS - 7 * 24 * 3_600_000, now: NOW_MS, controls: true };

describe('AccountRow', () => {
  it('leads with how much of the main window is used, over a chart of it', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    const row = screen.getByRole('article', { name: 'one@example.com' });
    expect(within(row).getByRole('heading', { level: 3 })).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'one@example.com' })).toHaveAttribute(
      'href',
      '/accounts/00000000000000a1'
    );
    expect(within(row).getByRole('img', { name: 'Anthropic' })).toBeInTheDocument();
    expect(within(row).getByText('One Org · 2 resets, 1 usable')).toBeInTheDocument();
    // Both weekly windows reset together; the first listed leads.
    expect(row).toHaveTextContent('76%used');
    expect(row).toHaveTextContent('7 Day · resets in 21h');
    expect(row).toHaveAttribute('data-severity', 'normal');
    expect(row).toHaveAttribute('data-chart', 'history');
    expect(within(row).getByText('active')).toHaveAttribute('data-tone', 'ok');
  });

  it('lists the other windows as small values', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    const others = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(others.map(item => item.textContent)).toEqual(['5 Hour not reported', '7 Day Fable 92% · 21h']);
    // The Fable window is nearly spent, and says so in more than position.
    expect(within(others[1]!).getByText('92%')).toHaveClass('text-warn');
    // Each sits on its own solid chip, so the chart never runs through it.
    expect(others[1]).toHaveClass('bg-surface');
  });

  it('marks a main window that is nearly or wholly spent, in more than colour', () => {
    const { rerender } = render(
      <AccountRow
        {...base}
        account={{ ...strayFixture, limits: [{ id: 'codex:7d', label: '7 days', usedFraction: 0.9 }] }}
      />
    );

    expect(screen.getByRole('article')).toHaveAttribute('data-severity', 'warn');
    expect(screen.getByRole('article')).toHaveTextContent('▲90%used, near its limit');

    rerender(
      <AccountRow
        {...base}
        account={{ ...strayFixture, limits: [{ id: 'codex:7d', label: '7 days', usedFraction: 1.3 }] }}
      />
    );

    expect(screen.getByRole('article')).toHaveAttribute('data-severity', 'danger');
    // Overage shows as it is.
    expect(screen.getByRole('article')).toHaveTextContent('■130%used, spent');
  });

  it('starts its chart where its own history starts', () => {
    const { container } = render(
      <AccountRow
        {...base}
        account={{ ...strayFixture, limits: [{ id: 'codex:7d', label: '7 days', usedFraction: 0.5 }] }}
        trends={[
          {
            accountId: strayFixture.id,
            limitId: 'codex:7d',
            points: [
              { at: at(-2 * 3_600_000), usedFraction: 0 },
              { at: at(-3_600_000), usedFraction: 0.25 },
            ],
          },
        ]}
      />
    );

    // Two hours of history in a seven-day period: the line still runs edge to edge.
    expect(container.querySelector('article > svg path:nth-of-type(2)')).toHaveAttribute(
      'd',
      'M0.00 40.00 L50.00 30.25 L100.00 20.50'
    );
  });

  it('draws a level and no line when nothing is recorded', () => {
    const { container } = render(<AccountRow {...base} trends={[]} account={seatFixture} />);

    expect(screen.getByRole('article')).toHaveAttribute('data-chart', 'level');
    // The row's own chart, not the provider's mark: a glow and no line.
    expect(container.querySelectorAll('article > svg path')).toHaveLength(1);
  });

  it('marks a paused account and offers to resume it', () => {
    render(<AccountRow {...base} account={pausedSeatFixture} headingLevel={2} />);

    expect(screen.getByRole('heading', { level: 2, name: 'two@example.com' })).toBeInTheDocument();
    // Paused wins over omp's own block.
    expect(screen.getByText('paused')).toHaveAttribute('data-tone', 'warn');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
  });

  it("names omp's own block when the account is not paused", () => {
    render(<AccountRow {...base} account={{ ...pausedSeatFixture, paused: false }} />);

    expect(screen.getByText('blocked 2h')).toHaveAttribute('data-tone', 'danger');
  });

  it('offers no pause without a broker or without a credential', () => {
    const { rerender } = render(<AccountRow {...base} account={seatFixture} controls={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<AccountRow {...base} account={strayFixture} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // A provider that does not say how many resets are usable gets no count.
    expect(screen.getByText('pro · 1 reset')).toBeInTheDocument();
  });

  it('leaves out an organisation named after the account', () => {
    render(
      <AccountRow
        {...base}
        account={{ ...seatFixture, orgName: "one@example.com's Organization", resets: undefined }}
      />
    );

    expect(screen.queryByText(/Organization/)).not.toBeInTheDocument();
  });

  it('says when the usage it shows is old', () => {
    render(<AccountRow {...base} account={{ ...seatFixture, resets: undefined, fetchedAt: at(-40 * 60_000) }} />);

    expect(screen.getByText('One Org · usage 40m old')).toBeInTheDocument();
  });

  it('says when an account reports no usage', () => {
    render(<AccountRow {...base} account={keyFixture} />);

    const row = screen.getByRole('article', { name: 'OpenRouter API key' });
    expect(row).toHaveTextContent('no usage reported');
    expect(row).toHaveAttribute('data-chart', 'none');
  });

  it('pauses the account and writes the answer into the account list', async () => {
    server.use(pauseHandlers.ok);
    const { client } = render(<AccountRow {...base} account={seatFixture} />);
    client.setQueryData(listAccountsQueryKey(), accountsFixture);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      const list = client.getQueryData<AccountList>(listAccountsQueryKey());
      expect(list?.accounts.map(account => account.paused)).toEqual([true, true, false, false]);
    });
  });

  it('disables the control while a change is on its way', async () => {
    server.use(pauseHandlers.pending);
    render(<AccountRow {...base} account={seatFixture} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('says why a pause failed', async () => {
    server.use(pauseHandlers.refused);
    render(<AccountRow {...base} account={seatFixture} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not pause the account: pause: POST /v1/credential/1/block: HTTP 401: unauthorized'
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });
});
