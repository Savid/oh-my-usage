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
    expect(within(row).getByText('One Org · $200/mo · 2 resets, 1 usable')).toBeInTheDocument();
    // Both weekly windows reset together; the first listed leads.
    expect(row).toHaveTextContent('76%used');
    expect(row).toHaveTextContent('7 Day · resets in 21h · +10.7%/day');
    expect(row).toHaveAttribute('data-severity', 'normal');
    expect(row).toHaveAttribute('data-chart', 'history');
    // Taking work is the normal state and says nothing.
    expect(within(row).queryByText('active')).not.toBeInTheDocument();
  });

  it('lists the other windows as short lines beside the name', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    const others = within(screen.getByRole('list', { name: 'Other windows' })).getAllByRole('listitem');
    // The Fable window runs dry before it resets at its pace, and is marked for it.
    expect(others.map(item => item.textContent)).toEqual([
      '5 Hournot reported',
      '7 Day Fable▲ runs dry before it resets, 92%, near its limitin 21h',
    ]);
    // The Fable window is nearly spent, and says so in more than position.
    expect(within(others[1]!).getByText(/92%/)).toHaveClass('text-warn');
    // Its bar fills to what is used, in the provider's colour; one not reported has none.
    expect(others[1]!.querySelector('svg rect:nth-of-type(2)')).toHaveAttribute('width', '92');
    expect(others[1]!.querySelector('svg rect:nth-of-type(2)')).toHaveClass('fill-anthropic');
    expect(others[0]!.querySelector('svg')).toBeNull();
  });

  it('gives the chart the rest of the row on a wide screen, clear of the words', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    expect(screen.getByTestId('history')).toHaveClass('lg:left-208');
    // Nothing written is drawn over it: the words end where it starts.
    expect(screen.getByRole('list', { name: 'Other windows' })).toHaveClass('lg:w-64');
  });

  it('runs the chart behind the whole of a narrow row, top to foot and end to end', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    expect(screen.getByTestId('history')).toHaveClass('inset-y-0', 'left-0', 'right-3');
  });

  it('leaves out the list when there are no other windows', () => {
    render(<AccountRow {...base} account={strayFixture} />);

    expect(screen.queryByRole('list', { name: 'Other windows' })).not.toBeInTheDocument();
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
    expect(container.querySelector('[data-testid="history"] path:nth-of-type(2)')).toHaveAttribute(
      'd',
      'M0.00 40.00 L50.00 30.25 L100.00 20.50'
    );
  });

  it('draws a level and no line when nothing is recorded', () => {
    const { container } = render(<AccountRow {...base} trends={[]} account={seatFixture} />);

    expect(screen.getByRole('article')).toHaveAttribute('data-chart', 'level');
    // The row's own chart, not the provider's mark: a glow and no line.
    expect(container.querySelectorAll('[data-testid="history"] path')).toHaveLength(1);
  });

  it('marks a paused account and offers to resume it', () => {
    render(<AccountRow {...base} account={pausedSeatFixture} headingLevel={2} />);

    expect(screen.getByRole('heading', { level: 2, name: 'two@example.com' })).toBeInTheDocument();
    // Paused wins over omp's own block.
    expect(screen.getByText('paused')).toHaveAttribute('data-tone', 'warn');
    // A way back, lit so it shows without pointing at the row; it says what it does.
    const control = screen.getByRole('button', { name: 'Resume' });
    expect(control).toBeEnabled();
    expect(control).toHaveClass('text-warn');
    expect(control).not.toHaveClass('pointer-fine:opacity-0');
    expect(control).toHaveAttribute('title', 'Resume: let omp send it traffic');
  });

  it("names omp's own block when the account is not paused", () => {
    render(<AccountRow {...base} account={{ ...pausedSeatFixture, paused: false }} />);

    expect(screen.getByText('blocked 2h')).toHaveAttribute('data-tone', 'danger');
  });

  it('offers no pause without a broker or without a credential', () => {
    const { rerender } = render(<AccountRow {...base} account={seatFixture} controls={false} />);
    expect(screen.queryByRole('button', { name: /^(Pause|Resume)$/ })).not.toBeInTheDocument();
    // A paused account still says so.
    rerender(<AccountRow {...base} account={pausedSeatFixture} controls={false} />);
    expect(screen.getByText('paused')).toBeInTheDocument();

    rerender(<AccountRow {...base} account={strayFixture} />);
    expect(screen.queryByRole('button', { name: /^(Pause|Resume)$/ })).not.toBeInTheDocument();
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

    expect(screen.getByText('One Org · $200/mo · usage 40m old')).toBeInTheDocument();
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

    const control = screen.getByRole('button', { name: 'Pause' });
    // With a mouse it waits for the row to be pointed at, so the chart runs clear.
    expect(control).toHaveClass('pointer-fine:opacity-0', 'pointer-fine:group-hover:opacity-100');
    expect(control).toHaveAttribute('title', "Pause: move omp's traffic off it");
    fireEvent.click(control);

    await waitFor(() => {
      const list = client.getQueryData<AccountList>(listAccountsQueryKey());
      expect(list?.accounts.map(account => account.paused)).toEqual([true, true, false, false]);
    });
  });

  it('disables the control while a change is on its way', async () => {
    server.use(pauseHandlers.pending);
    render(<AccountRow {...base} account={seatFixture} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    // It turns at once, and the state with it, and holds still until the broker answers.
    const control = await screen.findByRole('button', { name: 'Resume' });
    expect(control).toBeDisabled();
    expect(screen.getByText('paused')).toBeInTheDocument();
  });

  it('says why a pause failed', async () => {
    server.use(pauseHandlers.refused);
    render(<AccountRow {...base} account={seatFixture} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not pause the account: pause: POST /v1/credential/1/block: HTTP 401: unauthorized'
    );
    // Refused, it turns back.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.queryByText('paused')).not.toBeInTheDocument();
  });
});

describe('AccountRow, looking ahead', () => {
  it('warns when the main window runs dry before it resets, and says nothing more otherwise', () => {
    const week = {
      id: 'codex:7d',
      label: '7 days',
      usedFraction: 0.5,
      resetsAt: at(50 * 3_600_000),
      windowSeconds: 7 * 86_400,
    };
    const climbing = {
      accountId: strayFixture.id,
      limitId: 'codex:7d',
      points: [
        { at: at(-10 * 3_600_000), usedFraction: 0.3 },
        { at: at(-3_600_000), usedFraction: 0.48 },
      ],
    };
    const { rerender } = render(
      <AccountRow {...base} account={{ ...strayFixture, limits: [week] }} trends={[climbing]} />
    );

    // Two points an hour with half left: 25 hours, of 50 to the reset.
    expect(screen.getByRole('article')).toHaveTextContent('7 days · resets in 2d 2h · ▲ runs dry in 1d 1h');

    const flat = { ...climbing, points: climbing.points.map(point => ({ ...point, usedFraction: 0.5 })) };
    rerender(<AccountRow {...base} account={{ ...strayFixture, limits: [week] }} trends={[flat]} />);
    expect(screen.getByRole('article')).toHaveTextContent('7 days · resets in 2d 2h · idle');
    expect(screen.getByRole('article')).not.toHaveTextContent('runs dry');
  });
});
