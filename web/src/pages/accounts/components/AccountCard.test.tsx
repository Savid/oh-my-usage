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
} from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { AccountCard } from './AccountCard';

describe('AccountCard', () => {
  it('shows who the account is, its state and its usage', () => {
    render(<AccountCard account={seatFixture} now={NOW_MS} controls />);

    const card = screen.getByRole('article', { name: 'one@example.com' });
    expect(within(card).getByRole('heading', { level: 3 })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'one@example.com' })).toHaveAttribute(
      'href',
      '/accounts/00000000000000a1'
    );
    expect(within(card).getByText('One Org · login')).toBeInTheDocument();
    expect(within(card).getByText('active')).toHaveAttribute('data-tone', 'ok');
    expect(within(card).getAllByRole('meter')).toHaveLength(2);
    expect(within(card).getByText('not reported')).toBeInTheDocument();
    expect(within(card).getByText('2 saved resets, 1 usable now, first expires in 28 d')).toBeInTheDocument();
    expect(within(card).getByText('Usage read 12 s ago')).toBeInTheDocument();
  });

  it('marks a paused account and offers to resume it', () => {
    render(<AccountCard account={pausedSeatFixture} now={NOW_MS} controls headingLevel={2} />);

    expect(screen.getByRole('heading', { level: 2, name: 'two@example.com' })).toBeInTheDocument();
    // Paused wins over omp's own block.
    expect(screen.getByText('paused')).toHaveAttribute('data-tone', 'warn');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
  });

  it("names omp's own block when the account is not paused", () => {
    render(<AccountCard account={{ ...pausedSeatFixture, paused: false }} now={NOW_MS} controls />);

    expect(screen.getByText('blocked for 2 h')).toHaveAttribute('data-tone', 'danger');
  });

  it('offers no pause without a broker or without a credential', () => {
    const { rerender } = render(<AccountCard account={seatFixture} now={NOW_MS} controls={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<AccountCard account={strayFixture} now={NOW_MS} controls />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('pro plan')).toBeInTheDocument();
    // A provider that does not say how many resets are usable gets no count.
    expect(screen.getByText('1 saved reset')).toBeInTheDocument();
  });

  it('says when an account reports no usage', () => {
    render(<AccountCard account={keyFixture} now={NOW_MS} controls />);

    expect(screen.getByRole('article', { name: 'API key' })).toBeInTheDocument();
    expect(screen.getByText('No usage is reported for this account.')).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('pauses the account and writes the answer into the account list', async () => {
    server.use(pauseHandlers.ok);
    const { client } = render(<AccountCard account={seatFixture} now={NOW_MS} controls />);
    client.setQueryData(listAccountsQueryKey(), accountsFixture);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      const list = client.getQueryData<AccountList>(listAccountsQueryKey());
      expect(list?.accounts.map(account => account.paused)).toEqual([true, true, false, false]);
    });
  });

  it('disables the control while a change is on its way', async () => {
    server.use(pauseHandlers.pending);
    render(<AccountCard account={seatFixture} now={NOW_MS} controls />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('says why a pause failed', async () => {
    server.use(pauseHandlers.refused);
    render(<AccountCard account={seatFixture} now={NOW_MS} controls />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not pause the account: pause: POST /v1/credential/1/block: HTTP 401: unauthorized'
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });
});
