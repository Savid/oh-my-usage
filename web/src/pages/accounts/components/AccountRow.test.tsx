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
    // Saved resets say when the first that can be spent lapses, quietly: its week resets first.
    expect(within(row).getByText('One Org · $200/mo · 2 resets, 1 usable, one lapses in 28d')).toBeInTheDocument();
    // Both weekly windows reset together; the first listed leads.
    expect(row).toHaveTextContent('76%used');
    expect(row).toHaveTextContent('7 Day · resets in 21h · +10.7%/day');
    expect(row).toHaveAttribute('data-severity', 'normal');
    expect(row).toHaveAttribute('data-chart', 'history');
    // Taking work is the normal state and says nothing.
    expect(within(row).queryByText('active')).not.toBeInTheDocument();
  });

  it('names the other windows on the chart, a longer one as a line', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    const history = screen.getByTestId('history');
    // Fable lasts as long as the main window: a thin line under it, from the same start.
    expect(history.querySelector('path[data-window="anthropic:7d:fable"]')?.getAttribute('d')).toMatch(/^M0\.00 /);
    // Each is named short of the row's end, at its own level, apart from the others.
    const labels = [...history.querySelectorAll(':scope > span')];
    expect(labels.map(label => label.textContent)).toEqual(['5h–', 'Fable▲ 92%']);
    expect(labels[0]).toHaveClass('top-9/10');
    expect(labels[1]).toHaveClass('top-1/10');
    // Fable resets with the main window, so its label leaves out when; it is nearly spent.
    expect(within(labels[1] as HTMLElement).getByText(/92%/)).toHaveClass('text-warn');

    // On a wide screen the words are for assistive technology, each a sentence.
    const list = screen.getByRole('list', { name: 'Other windows' });
    expect(list).toHaveClass('lg:sr-only');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map(item => item.querySelector('.sr-only')?.textContent)
    ).toEqual(['5 Hour: not reported', '7 Day Fable: 92% used, near its limit, resets in 21h']);
  });

  it('draws a window short beside the chart as bars of its peaks', () => {
    render(<AccountRow {...base} account={pausedSeatFixture} />);

    const history = screen.getByTestId('history');
    // Five hours beside a week: a bar a stretch, from the foot, on the chart's own scale.
    const bars = history.querySelector('path[data-window="anthropic:5h"]');
    expect(bars).toHaveClass('fill-border');
    expect(bars?.getAttribute('d')).toMatch(/^M[\d.]+ 40 V[\d.]+ H[\d.]+ V40 Z M/);
    // It resets apart from the main window, so its label says when.
    expect(history.querySelector(':scope > span')).toHaveTextContent(/^5h.*in 2h$/);
  });

  it('moves labels that would sit together apart', () => {
    const quiet = {
      ...seatFixture,
      limits: seatFixture.limits.map(limit =>
        limit.id === 'anthropic:7d:fable' ? { ...limit, usedFraction: 0 } : limit
      ),
    };
    render(<AccountRow {...base} account={quiet} />);

    const labels = [...screen.getByTestId('history').querySelectorAll(':scope > span')];
    // Both at nothing: one stays near the foot, the other a label's height above it.
    expect(labels[0]).toHaveClass('top-7/10');
    expect(labels[1]).toHaveClass('top-9/10');
  });

  it('keeps the words in view when there is no chart to name them on', () => {
    const week = { id: 'codex:7d', label: '7 days', windowSeconds: 7 * 86_400, resetsAt: at(50 * 3_600_000) };
    // No window reports a share, so none leads and there is no chart.
    const session = { id: 'codex:5h', label: '5 hours', windowSeconds: 5 * 3600, resetsAt: at(2 * 3_600_000) };
    render(<AccountRow {...base} account={{ ...strayFixture, limits: [week, session] }} />);

    expect(screen.getByRole('article')).toHaveAttribute('data-chart', 'none');
    expect(screen.getByRole('list', { name: 'Other windows' })).not.toHaveClass('lg:sr-only');
  });

  it('gives the chart the rest of the row on a wide screen, clear of the words', () => {
    render(<AccountRow {...base} account={seatFixture} />);

    // It starts where the name's column ends: nothing written sits on it but its own labels.
    expect(screen.getByTestId('history')).toHaveClass('lg:left-134');
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
    expect(screen.getByText('pro · 1 reset, lapses in 30d')).toBeInTheDocument();
  });

  it('leads with a saved reset that lapses before its window resets, marked', () => {
    render(<AccountRow {...base} account={lapsingSeatFixture} />);

    const row = screen.getByRole('article', { name: 'one@example.com' });
    const alarm = within(row).getByText('2 resets, 1 usable, spend one within 12h');
    expect(alarm).toHaveClass('text-warn');
    expect(alarm).toHaveTextContent(/^▲ /);
    expect(alarm.parentElement).toHaveTextContent(/^▲ 2 resets, 1 usable, spend one within 12h · One Org · \$200\/mo$/);
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
  it('shows the pace, or idle, and never a forecast', () => {
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

    // Two points an hour with half left would run out a day before the reset: the row only says the pace.
    expect(screen.getByRole('article')).toHaveTextContent('7 days · resets in 2d 2h · +2.0%/h');
    expect(screen.getByRole('article')).not.toHaveTextContent('▲');

    const flat = { ...climbing, points: climbing.points.map(point => ({ ...point, usedFraction: 0.5 })) };
    rerender(<AccountRow {...base} account={{ ...strayFixture, limits: [week] }} trends={[flat]} />);
    expect(screen.getByRole('article')).toHaveTextContent('7 days · resets in 2d 2h · idle');
  });
});
