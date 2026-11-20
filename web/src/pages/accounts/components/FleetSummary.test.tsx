import { describe, expect, it } from 'vitest';
import type { Fleet } from '@/lib/fleet';
import { render, screen } from '@/test-utils';
import { at, NOW_MS } from '@/test-utils/time';
import { FleetSummary } from './FleetSummary';

const quiet: Fleet = {
  accounts: 1,
  burning: 0,
  idle: 0,
  paused: 0,
  spent: 0,
  priced: 0,
  resetsUsable: 0,
  resetsLapsing: 0,
};

describe('FleetSummary', () => {
  it('says every figure that is not nothing, alarms in more than colour', () => {
    render(
      <FleetSummary
        fleet={{
          accounts: 10,
          burning: 6,
          idle: 4,
          paused: 1,
          spent: 1,
          monthlyUsd: 780,
          priced: 10,
          resetsUsable: 3,
          resetsLapsing: 2,
        }}
        updatedAt={at(-45_000)}
        now={NOW_MS}
      />
    );

    const fleet = screen.getByRole('region', { name: 'Fleet' });
    expect(fleet).toHaveTextContent(
      'accounts10burning▴6idle○4paused1spent■1in all$780/moresets to spend3resets lapsing▲2gateway read 45s ago'
    );
    expect(screen.getByText('spent').parentElement).toHaveClass('text-danger');
    // A reset about to lapse is a warning: it costs nothing yet.
    expect(screen.getByText('resets lapsing').parentElement).toHaveClass('text-warn');
  });

  it('leaves out what is nothing, and says how many accounts a price covers', () => {
    render(<FleetSummary fleet={{ ...quiet, accounts: 3, monthlyUsd: 50, priced: 1 }} now={NOW_MS} />);

    expect(screen.getByRole('region', { name: 'Fleet' })).toHaveTextContent(
      'accounts3for 1 priced$50/mogateway not read yet'
    );
  });

  it('counts one account in the singular', () => {
    render(<FleetSummary fleet={{ ...quiet, resetsUsable: 1, resetsLapsing: 1 }} now={NOW_MS} />);

    expect(screen.getByText('account')).toBeInTheDocument();
    expect(screen.getByText('reset to spend')).toBeInTheDocument();
    expect(screen.getByText('reset lapsing')).toBeInTheDocument();
  });
});
