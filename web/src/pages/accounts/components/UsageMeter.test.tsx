import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { at, NOW_MS } from '@/test-utils/time';
import { UsageMeter } from './UsageMeter';

const HOUR = 3_600_000;

describe('UsageMeter', () => {
  it('shows the used share and when the window resets', () => {
    render(
      <UsageMeter
        limit={{ id: '7d', label: 'Claude 7 Day', usedFraction: 0.76, status: 'ok', resetsAt: at(21 * HOUR) }}
        now={NOW_MS}
      />
    );

    const meter = screen.getByRole('meter', { name: 'Claude 7 Day' });
    expect(meter).toHaveAttribute('aria-valuenow', '76');
    expect(meter).toHaveAttribute('aria-valuetext', '76% used');
    expect(meter).toHaveAttribute('data-severity', 'normal');
    expect(screen.getByText('76%')).toBeInTheDocument();
    expect(screen.getByText('Resets in 21 h')).toBeInTheDocument();
  });

  it('says in words when a limit is near or spent', () => {
    const { rerender } = render(
      <UsageMeter limit={{ id: '7d', label: 'Week', usedFraction: 0.92, resetsAt: at(HOUR) }} now={NOW_MS} />
    );

    expect(screen.getByRole('meter')).toHaveAttribute('data-severity', 'warn');
    expect(screen.getByText('Near its limit, resets in 60 min')).toBeInTheDocument();

    rerender(<UsageMeter limit={{ id: '7d', label: 'Week', usedFraction: 1.2, status: 'exhausted' }} now={NOW_MS} />);

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('data-severity', 'danger');
    // Overage shows in the figure; the bar stops at full.
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('120%')).toBeInTheDocument();
    expect(screen.getByText('Used up')).toBeInTheDocument();
  });

  it('draws no bar for a limit the provider did not report', () => {
    render(<UsageMeter limit={{ id: '5h', label: 'Claude 5 Hour' }} now={NOW_MS} />);

    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.getByText('not reported')).toBeInTheDocument();
  });
});
