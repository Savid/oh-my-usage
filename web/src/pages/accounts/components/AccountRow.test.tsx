import { describe, expect, it } from 'vitest';
import type { AccountList } from '@/api';
import { listAccountsQueryKey } from '@/api/@tanstack/react-query.gen';
import { fireEvent, render, screen, server, waitFor, within } from '@/test-utils';
import {
  accountsFixture,
  keyFixture,
  lapsingSeatFixture,
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
    // The second look waits on hover over the name: who it is, its saved resets, its pace.
    expect(within(row).getByRole('link', { name: 'one@example.com' })).toHaveAttribute(
      'title',
      'One Org · $200/mo · 2 saved resets, 1 usable now; the first lapses in 28d · +10.7%/day'
    );
    // Saved resets that are not about to lapse are not on the row.
    expect(within(row).queryByTestId('resets')).not.toBeInTheDocument();
    // Both weekly windows reset together; the first listed leads.
    expect(row).toHaveTextContent('76%used');
    expect(row).toHaveTextContent(/7 Day · resets in 21h.* · Fable ▲ 92%$/);
    expect(row).toHaveAttribute('data-severity', 'normal');
    expect(row).toHaveAttribute('data-chart', 'history');
    // Taking work is the normal state and says nothing.
    expect(within(row).queryByText('active')).not.toBeInTheDocument();
  });

  it('draws the main window alone, and names the others in words under the name, never over the chart', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    // Nothing but the main window's line and glow in the chart.
    expect(screen.getByTestId('history').querySelector('[data-window]')).toBeNull();
    expect(screen.getByTestId('history').querySelector('span')).toBeNull();

    const items = within(screen.getByRole('list', { name: 'Other windows' })).getAllByRole('listitem');
    expect(items.map(item => item.querySelector('.sr-only')?.textContent)).toEqual([
      '5 Hour: not reported',
      '7 Day Fable: 92% used, near its limit, resets in 21h',
    ]);
    // A window with nothing reported says nothing worth showing; it is still heard.
    expect(items[0]).toHaveClass('sr-only');
    // Fable: its share, marked, in the colour of its state; it resets with the main window, so not when.
    expect(items[1]!.querySelector('.font-semibold')).toHaveTextContent('▲ 92%');
    expect(items[1]!.querySelector('.font-semibold')).toHaveClass('text-warn');
    expect(items[1]).toHaveTextContent(/ · Fable ▲ 92%$/);
  });

  it('says when another window resets apart from the main one', () => {
    render(<AccountRow {...base} account={pausedSeatFixture} />);

    // Heard, and on the account's page; the row keeps to the share.
    const item = within(screen.getByRole('list', { name: 'Other windows' })).getAllByRole('listitem')[0]!;
    expect(item.querySelector('.sr-only')).toHaveTextContent(/resets in 2h$/);
    expect(item.querySelector('[aria-hidden]')).not.toHaveTextContent('in 2h');
  });

  it('keeps a window with nothing used out of sight', () => {
    const idle = {
      ...seatFixture,
      limits: seatFixture.limits.map(limit =>
        limit.id === 'anthropic:7d:fable' ? { ...limit, usedFraction: 0 } : limit
      ),
    };
    render(<AccountRow {...base} account={idle} />);

    for (const item of within(screen.getByRole('list', { name: 'Other windows' })).getAllByRole('listitem')) {
      expect(item).toHaveClass('sr-only');
    }
  });

  it('lists the other windows when there is no chart', () => {
    const week = { id: 'codex:7d', label: '7 days', windowSeconds: 7 * 86_400, resetsAt: at(50 * 3_600_000) };
    // No window reports a share, so none leads and there is no chart.
    const session = { id: 'codex:5h', label: '5 hours', windowSeconds: 5 * 3600, resetsAt: at(2 * 3_600_000) };
    render(<AccountRow {...base} account={{ ...strayFixture, limits: [week, session] }} />);

    expect(screen.getByRole('article')).toHaveAttribute('data-chart', 'none');
    expect(screen.getByRole('list', { name: 'Other windows' })).toBeInTheDocument();
  });

  it('gives the chart the rest of the row on a wide screen, clear of the words', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    // It runs from where the name's column ends to the row's end: nothing written sits on it.
    expect(screen.getByTestId('history')).toHaveClass('lg:left-134');
  });

  it("draws the chart as a strip along a narrow row's foot, and from where the words end on a wide one", () => {
    render(<AccountRow {...base} account={seatFixture} />);

    expect(screen.getByTestId('history')).toHaveClass(
      'inset-x-0',
      'bottom-0',
      'h-7',
      'lg:top-0',
      'lg:left-134',
      'lg:right-3'
    );
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
    expect(screen.getByRole('link', { name: 'codex@example.com' })).toHaveAttribute(
      'title',
      'pro · 1 saved reset; the first lapses in 30d'
    );
  });

  it('leads with a saved reset that lapses before its window resets, marked', () => {
    render(<AccountRow {...base} account={lapsingSeatFixture} />);

    const row = screen.getByRole('article', { name: 'one@example.com' });
    const alarm = within(row).getByTestId('resets');
    expect(alarm).toHaveClass('text-warn');
    expect(alarm.querySelector('[aria-hidden]')).toHaveTextContent('▲ spend 1 in 12h');
    expect(alarm).toHaveAttribute(
      'title',
      '2 saved resets, 1 usable now: spend one within 12h, before its window resets, or lose it'
    );
    // The main window's own state is not changed by it.
    expect(row).toHaveAttribute('data-severity', 'normal');
  });

  it('says where the gateway picks it and why, or only where when its state already says why', () => {
    const { rerender } = render(
      <AccountRow
        {...base}
        account={seatFixture}
        priority={{ standing: 'ranked', rank: 1, reason: 'reset lapses in 2d', position: 0 }}
      />
    );
    expect(screen.getByTestId('priority')).toHaveTextContent('Gateway pick: 1st · reset lapses in 2d');
    // Information, in blue, for an account the gateway picks; grey for one it holds back.
    expect(screen.getByTestId('priority')).toHaveClass('bg-info-subtle', 'text-info');

    rerender(
      <AccountRow
        {...base}
        account={pausedSeatFixture}
        priority={{ standing: 'last', reason: 'paused', position: 3 }}
      />
    );
    expect(screen.getByTestId('priority')).toHaveTextContent(/^Gateway pick: last$/);
    expect(screen.getByTestId('priority')).toHaveClass('bg-raised', 'text-muted');

    rerender(<AccountRow {...base} account={keyFixture} />);
    expect(screen.queryByTestId('priority')).not.toBeInTheDocument();
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

    // Old usage says so on the row, at every width.
    expect(screen.getByRole('article')).toHaveTextContent(/ · usage 40m old$/);
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
  it('keeps the pace to the second look, and never shows a forecast', () => {
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

    // Two points an hour with half left would run out a day before the reset: the row says neither.
    expect(screen.getByRole('article')).toHaveTextContent(/7 days · resets in 2d 2h$/);
    expect(screen.getByRole('article')).not.toHaveTextContent('▲');
    expect(screen.getByRole('link', { name: 'codex@example.com' })).toHaveAttribute(
      'title',
      'pro · 1 saved reset; the first lapses in 30d · +2.0%/h'
    );

    const flat = { ...climbing, points: climbing.points.map(point => ({ ...point, usedFraction: 0.5 })) };
    rerender(<AccountRow {...base} account={{ ...strayFixture, limits: [week] }} trends={[flat]} />);
    expect(screen.getByRole('link', { name: 'codex@example.com' })).toHaveAttribute(
      'title',
      'pro · 1 saved reset; the first lapses in 30d'
    );
  });
});
