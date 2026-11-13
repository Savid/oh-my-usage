import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test-utils';
import { trafficFixture } from '@/test-utils/handlers';
import { TrafficClients } from './TrafficClients';

describe('TrafficClients', () => {
  it('lists each client, application and provider with every kind of token', () => {
    render(<TrafficClients clients={trafficFixture.clients} />);

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    // A header and one row per client, application and provider.
    expect(rows).toHaveLength(5);
    expect(
      within(rows[0]!)
        .getAllByRole('columnheader')
        .map(cell => cell.textContent)
    ).toEqual(['Client', 'App', 'Provider', 'Requests', 'Input', 'Output', 'Cache read', 'Cache write', 'API value']);
    expect(within(rows[1]!).getByRole('rowheader')).toHaveTextContent('gateway-host');
    expect(within(rows[1]!).getByRole('rowheader')).toHaveAttribute('title', 'install-1');
    expect(
      within(rows[1]!)
        .getAllByRole('cell')
        .map(cell => cell.textContent)
    ).toEqual(['gateway', 'Anthropic', '15.6K', '31.3K', '14.1M', '2.82B', '93.8M', '$1,760']);
    expect(within(rows[2]!).getByRole('rowheader')).toHaveTextContent('laptop');
  });

  it('names a client with no hostname by its installation, and an app with no name', () => {
    render(<TrafficClients clients={[{ ...trafficFixture.clients[0]!, hostname: '', app: '' }]} />);

    expect(screen.getByRole('rowheader')).toHaveTextContent('install-1');
    expect(screen.getByText('unnamed')).toBeInTheDocument();
  });

  it('says when no client sent anything', () => {
    render(<TrafficClients clients={[]} />);

    expect(screen.getByText('No client has sent anything in the last 7 days.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
