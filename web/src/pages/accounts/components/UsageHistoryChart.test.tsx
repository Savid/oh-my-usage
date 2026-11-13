import { describe, expect, it, vi } from 'vitest';
import type { UsageSample } from '@/api';
import { fireEvent, render, screen, within } from '@/test-utils';
import { historyFixture } from '@/test-utils/handlers';
import { at } from '@/test-utils/time';
import { UsageHistoryChart } from './UsageHistoryChart';

const HOUR = 3_600_000;

function sample(limitId: string, hours: number, usedFraction: number): UsageSample {
  return { at: at(hours * HOUR), limitId, label: limitId, usedFraction };
}

describe('UsageHistoryChart', () => {
  it('draws a line per limit and reads out the latest values', () => {
    const { container } = render(<UsageHistoryChart samples={historyFixture.samples} />);

    expect(screen.getByRole('img', { name: 'Share left of each limit over time' })).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(screen.getByText(/^Latest /)).toBeInTheDocument();

    const legend = within(screen.getByRole('list'));
    expect(legend.getByText('Claude 7 Day')).toBeInTheDocument();
    expect(legend.getByText('24%')).toBeInTheDocument();
    expect(legend.getByText('Claude 7 Day (Fable)')).toBeInTheDocument();
    expect(legend.getByText('8%')).toBeInTheDocument();
  });

  it('reads out the values under the pointer and goes back to the latest', () => {
    render(<UsageHistoryChart samples={[sample('7d', -4, 0.1), sample('7d', -2, 0.3), sample('7d', 0, 0.5)]} />);

    const plot = screen.getByTestId('plot');
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 400, 200));

    // A little past the middle sample, which holds until the next one.
    fireEvent.pointerMove(plot, { clientX: 320 });

    expect(screen.getByText(/^At /)).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getByText('70%')).toBeInTheDocument();
    expect(screen.getByTestId('crosshair')).toBeInTheDocument();

    fireEvent.pointerLeave(plot);

    expect(screen.getByText(/^Latest /)).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getByText('50%')).toBeInTheDocument();
    expect(screen.queryByTestId('crosshair')).not.toBeInTheDocument();
  });

  it('lists every value in a table', () => {
    render(<UsageHistoryChart samples={[sample('7d', -2, 0.1), sample('5h', -1, 0.4), sample('7d', 0, 0.2)]} />);

    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true });
    // A header and one row per moment; a limit with no sample yet is blank.
    expect(rows).toHaveLength(4);
    expect(
      within(rows[1]!)
        .getAllByRole('cell', { hidden: true })
        .map(cell => cell.textContent)
    ).toEqual(['90%', '']);
    expect(
      within(rows[3]!)
        .getAllByRole('cell', { hidden: true })
        .map(cell => cell.textContent)
    ).toEqual(['80%', '60%']);
  });

  it('draws at most three limits and says so', () => {
    const { container } = render(
      <UsageHistoryChart samples={['a', 'b', 'c', 'd'].map((id, index) => sample(id, -1, index / 10))} />
    );

    expect(container.querySelectorAll('path')).toHaveLength(3);
    expect(screen.getByText('Showing the first 3 of 4 limits.')).toBeInTheDocument();
  });

  it('shows overage as nothing left, never less', () => {
    render(<UsageHistoryChart samples={[sample('7d', -1, 0.9), sample('7d', 0, 1.3)]} />);

    expect(within(screen.getByRole('list')).getByText('0%')).toBeInTheDocument();
  });

  it('draws a single sample', () => {
    const { container } = render(<UsageHistoryChart samples={[sample('7d', 0, 0.4)]} />);

    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(within(screen.getByRole('list')).getByText('60%')).toBeInTheDocument();
  });

  it('says when nothing is recorded', () => {
    render(<UsageHistoryChart samples={[]} />);

    expect(screen.getByText('No usage has been recorded in this period yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
