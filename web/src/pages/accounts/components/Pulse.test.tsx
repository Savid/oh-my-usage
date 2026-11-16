import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test-utils';
import { quietTrafficFixture, staleTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { Pulse } from './Pulse';

describe('Pulse', () => {
  it('reads the gateway as three instruments: tokens, burn and value', () => {
    const { container } = render(<Pulse traffic={trafficFixture} monthlyUsd={780} now={NOW_MS} />);

    const band = screen.getByRole('region', { name: 'Traffic' });
    expect(screen.getByRole('link', { name: 'Traffic' })).toHaveAttribute('href', '/traffic');
    expect(band).toHaveTextContent('read 8s ago');
    expect(band).toHaveTextContent(/GENERATING[\d,.K]+tokens out a secondlast hour [\d.KM]+ out · peak [\d,.K]+\/s/i);
    expect(band).toHaveTextContent('Burn at API prices$249last hour24h $1,068 · 7d $1,786');
    // $780 a month is $180 a week; the week's traffic at API prices is $1,786.
    expect(band).toHaveTextContent("Value · last 7 days9.9×the subscriptions' cost, at API prices");
    expect(band).toHaveTextContent('$780/mo of subscriptions');
    const bars = within(band).getAllByRole('definition');
    expect(bars.map(bar => bar.textContent)).toEqual(['$1,786', '$180']);
    expect(container.querySelectorAll('[data-chart="history"]')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the cache in place of the value when nothing is priced', () => {
    render(<Pulse traffic={trafficFixture} now={NOW_MS} />);

    const band = screen.getByRole('region', { name: 'Traffic' });
    expect(band).not.toHaveTextContent('Value');
    expect(band).toHaveTextContent(/Cache\d+%of input read from a cache24h [\d.KMB]+ read from a cache/);
  });

  it('says when the broker stopped answering and how old the figures are', () => {
    render(<Pulse traffic={staleTrafficFixture} now={NOW_MS} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The broker is not answering, so this is not current: last read 12m ago. GET /v1/usage/clients: connection refused'
    );
    expect(screen.queryByText(/^read /)).not.toBeInTheDocument();
  });

  it('calls out traffic that has not been read for a while', () => {
    render(
      <Pulse traffic={{ ...trafficFixture, updatedAt: new Date(NOW_MS - 5 * 60_000).toISOString() }} now={NOW_MS} />
    );

    expect(screen.getByText('last read 5m ago')).toBeInTheDocument();
  });

  it('waits for the first reading, and reads nothing as nothing', () => {
    render(<Pulse traffic={{ ...quietTrafficFixture, updatedAt: undefined }} now={NOW_MS} />);

    const band = screen.getByRole('region', { name: 'Traffic' });
    expect(screen.getByText('waiting for the first reading')).toBeInTheDocument();
    expect(band).toHaveTextContent('Generating0tokens out a second');
    expect(band).toHaveTextContent('Burn at API prices$0last hour');
  });
});
