import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, server, waitFor, within } from '@/test-utils';
import { historyFixture, pauseHandlers, pausedSeatFixture, seatFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { AccountSummary } from './AccountSummary';

describe('AccountSummary', () => {
  it('says who it is, where the gateway picks it, that it takes traffic, and each window, the main one first', () => {
    render(
      <AccountSummary
        account={seatFixture}
        priority={{ standing: 'ranked', rank: 1, reason: '24% left', position: 0 }}
        controls
        samples={historyFixture.samples}
        now={NOW_MS}
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'one@example.com' })).toBeInTheDocument();
    expect(screen.getByTestId('priority')).toHaveTextContent('1st · 24% left');
    expect(screen.getByText('active')).toHaveAttribute('data-tone', 'ok');
    expect(screen.getByText('omp may send it traffic.')).toBeInTheDocument();

    const windows = within(screen.getByRole('list', { name: 'Usage windows' }));
    expect(windows.getAllByRole('listitem').map(item => item.getAttribute('aria-label'))).toEqual([
      'Claude 7 Day',
      'Claude 5 Hour',
      'Claude 7 Day (Fable)',
    ]);
  });

  it('marks a paused account and resumes it, the change shown at once', async () => {
    server.use(pauseHandlers.pending);
    render(<AccountSummary account={pausedSeatFixture} controls samples={[]} now={NOW_MS} />);

    // Paused wins over omp's own block.
    expect(screen.getByText('paused')).toHaveAttribute('data-tone', 'warn');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    // Shown at once, held until the broker answers.
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeDisabled();
    expect(screen.getByText(/^blocked/)).toHaveAttribute('data-tone', 'danger');
  });

  it("names omp's own block when the account is not paused", () => {
    render(<AccountSummary account={{ ...pausedSeatFixture, paused: false }} controls samples={[]} now={NOW_MS} />);

    expect(screen.getByText('blocked 2h')).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByText('omp sends it nothing until the block clears.')).toBeInTheDocument();
  });

  it('says why a pause did nothing', async () => {
    server.use(pauseHandlers.refused);
    render(<AccountSummary account={seatFixture} controls samples={[]} now={NOW_MS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not pause the account: pause: POST /v1/credential/1/block: HTTP 401: unauthorized'
      )
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });

  it('offers no pause without a broker, or for an account the broker does not hold', () => {
    const { rerender } = render(<AccountSummary account={seatFixture} controls={false} samples={[]} now={NOW_MS} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<AccountSummary account={{ ...seatFixture, pausable: false }} controls samples={[]} now={NOW_MS} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when the provider reports no windows', () => {
    render(<AccountSummary account={{ ...seatFixture, limits: [] }} controls samples={[]} now={NOW_MS} />);

    expect(screen.getByText('The provider reports no usage windows for this account.')).toBeInTheDocument();
  });
});
