import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import type { Pool } from '@/lib/pools';
import { trafficFixture } from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';
import { FleetBand } from './FleetBand';

const pool: Pool = {
  provider: 'anthropic',
  limitId: 'anthropic:7d',
  label: '7 Day',
  seats: 2,
  used: 0.95,
  usedFraction: 0.475,
  severity: 'normal',
  nextReset: at(21 * 3_600_000),
  staggered: true,
};

describe('FleetBand', () => {
  it('sets the totals beside the traffic', () => {
    render(<FleetBand pools={[pool]} traffic={trafficFixture} trafficStatus="success" now={NOW_MS} />);

    expect(screen.getByRole('list', { name: 'Totals' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Anthropic 7 Day' })).toHaveTextContent('48%');
    expect(screen.getByRole('region', { name: 'Traffic' })).toBeInTheDocument();
  });

  it('says nothing about traffic without a broker', () => {
    render(
      <FleetBand
        pools={[pool]}
        traffic={{ ...trafficFixture, available: false }}
        trafficStatus="success"
        now={NOW_MS}
      />
    );

    expect(screen.getByRole('list', { name: 'Totals' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Traffic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says while the traffic loads, and when it cannot be read', () => {
    const { rerender } = render(<FleetBand pools={[pool]} trafficStatus="pending" now={NOW_MS} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the traffic…');

    rerender(<FleetBand pools={[pool]} trafficStatus="error" now={NOW_MS} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the traffic.');
  });

  it('draws nothing with no totals and no broker', () => {
    const { container } = render(
      <FleetBand pools={[]} traffic={{ ...trafficFixture, available: false }} trafficStatus="success" now={NOW_MS} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
