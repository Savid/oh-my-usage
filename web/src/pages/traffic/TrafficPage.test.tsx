import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, server, within } from '@/test-utils';
import { trafficHandlers } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { TrafficPage } from './TrafficPage';

describe('TrafficPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the totals, the hour by minute, the week by hour and who sent it', async () => {
    // The fixture counts from NOW_MS; the page reads the clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    server.use(trafficHandlers.ok);
    render(<TrafficPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Traffic' })).toBeInTheDocument();

    const totals = within(await screen.findByRole('region', { name: 'Totals' }));
    expect(totals.getAllByRole('article').map(tile => tile.getAttribute('aria-label'))).toEqual([
      'Last hour',
      '24 hours',
      '7 days',
    ]);

    expect(
      within(screen.getByRole('region', { name: 'Last hour, by minute' })).getByRole('img', {
        name: 'Cost at API prices by minute, last hour',
      })
    ).toBeInTheDocument();

    const week = within(screen.getByRole('region', { name: 'Last 7 days, by hour' }));
    expect(week.getByRole('img', { name: 'Cost at API prices by hour, last 7 days' })).toBeInTheDocument();
    // Measuring began three days ago, so the first four days drawn are an estimate.
    expect(week.getByText(/^Measured since 2[34] Sept?, \d{2}:\d{2}\./)).toBeInTheDocument();

    expect(within(screen.getByRole('region', { name: 'Clients, last 7 days' })).getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says while it is loading', () => {
    server.use(trafficHandlers.pending);
    render(<TrafficPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading the traffic…');
  });

  it('says when the daemon cannot be reached', async () => {
    server.use(trafficHandlers.down);
    render(<TrafficPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach oh-my-usage.');
  });

  it('says what is missing when no broker is configured', async () => {
    server.use(trafficHandlers.unavailable);
    render(<TrafficPage />);

    expect(
      await screen.findByText(/Traffic is read from the omp auth broker, and none is configured\./)
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Totals' })).not.toBeInTheDocument();
  });

  it('keeps the last traffic and says so when the broker stops answering', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    server.use(trafficHandlers.stale);
    render(<TrafficPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The broker is not answering, so this is not current: last read 12m ago. GET /v1/usage/clients: connection refused'
    );
    expect(screen.getByRole('region', { name: 'Totals' })).toBeInTheDocument();
  });

  it('shows a broker with nothing passing through it', async () => {
    server.use(trafficHandlers.quiet);
    render(<TrafficPage />);

    expect(await screen.findAllByText('Nothing passed.')).toHaveLength(3);
    expect(screen.getAllByText('No traffic in this period.')).toHaveLength(2);
    expect(screen.getByText('No client has sent anything in the last 7 days.')).toBeInTheDocument();
    // Measuring has only just begun, so the week drawn reaches back before it.
    expect(screen.getByText(/^Measured since/)).toBeInTheDocument();
  });
});
