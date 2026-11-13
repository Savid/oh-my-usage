import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { quietTrafficFixture, staleTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { TrafficBand } from './TrafficBand';

describe('TrafficBand', () => {
  it('leads with the last hour, then the day and the week, beside the hour by minute', () => {
    render(<TrafficBand traffic={trafficFixture} now={NOW_MS} />);

    const band = screen.getByRole('region', { name: 'Traffic' });
    expect(band).toHaveTextContent('$249last hour, at API prices');
    expect(band).toHaveTextContent('1,834 req · 343M tok');
    expect(band).toHaveTextContent('24 hours$1,068 · 8,607 req · 1.61B tok');
    expect(band).toHaveTextContent('7 days$1,786 · 15.9K req · 2.97B tok');
    expect(band).toHaveTextContent('read 8s ago');
    expect(screen.getByRole('link', { name: 'Traffic' })).toHaveAttribute('href', '/traffic');
    expect(screen.getByRole('img', { name: 'Cost at API prices by minute, last hour' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when the broker stopped answering and how old the figures are', () => {
    render(<TrafficBand traffic={staleTrafficFixture} now={NOW_MS} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The broker is not answering, so this is not current: last read 12m ago. GET /v1/usage/clients: connection refused'
    );
    expect(screen.queryByText(/^read /)).not.toBeInTheDocument();
  });

  it('calls out traffic that has not been read for a while', () => {
    render(
      <TrafficBand
        traffic={{ ...trafficFixture, updatedAt: new Date(NOW_MS - 5 * 60_000).toISOString() }}
        now={NOW_MS}
      />
    );

    expect(screen.getByText('last read 5m ago')).toBeInTheDocument();
  });

  it('waits for the first reading', () => {
    render(<TrafficBand traffic={{ ...quietTrafficFixture, updatedAt: undefined }} now={NOW_MS} />);

    expect(screen.getByText('waiting for the first reading')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Traffic' })).toHaveTextContent('$0last hour, at API prices');
    expect(screen.getByText('No traffic in this period.')).toBeInTheDocument();
  });
});
