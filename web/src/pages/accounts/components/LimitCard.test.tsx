import { describe, expect, it } from 'vitest';
import type { Limit, UsageSample } from '@/api';
import { render, screen } from '@/test-utils';
import { at, NOW_MS } from '@/test-utils/time';
import { LimitCard } from './LimitCard';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const week: Limit = {
  id: 'anthropic:7d',
  label: 'Claude 7 Day',
  windowLabel: '7 Day',
  usedFraction: 0.5,
  status: 'ok',
  resetsAt: at(2 * DAY),
  windowSeconds: 7 * 24 * 3600,
};

function sample(hours: number, usedFraction: number): UsageSample {
  return { at: at(hours * HOUR), limitId: week.id, label: week.label, usedFraction };
}

describe('LimitCard', () => {
  it('shows what is used, when it resets and that it will see the window out', () => {
    const { container } = render(
      <LimitCard limit={week} provider="anthropic" samples={[sample(-12, 0.38), sample(0, 0.5)]} now={NOW_MS} />
    );

    const card = screen.getByRole('article', { name: 'Claude 7 Day' });
    expect(card).toHaveAttribute('data-severity', 'normal');
    expect(card).toHaveTextContent('7 Day71% of the window gone50%usedresets in 2d');
    expect(card).toHaveTextContent('At this pace it ends the window at 98%.');
    expect(card).toHaveTextContent('1.0%/h over the last 12h');

    // The gauge wears the provider's colour, with a tick where an even pace would be.
    expect(container.querySelector('rect.fill-anthropic')).toHaveAttribute('width', '50');
    expect(Number(screen.getByTestId('even-pace').getAttribute('x1'))).toBeCloseTo((5 / 7) * 100);
  });

  it('warns when it runs out before it resets', () => {
    render(<LimitCard limit={week} provider="anthropic" samples={[sample(-10, 0.3), sample(0, 0.5)]} now={NOW_MS} />);

    const outlook = screen.getByText(/At this pace it runs out in 1d 1h, 23h before it resets\./);
    expect(outlook).toHaveClass('text-warn');
    expect(screen.getByText('2.0%/h over the last 10h')).toBeInTheDocument();
  });

  it('reads the pace from the window itself when no usage is recorded', () => {
    render(<LimitCard limit={week} provider="anthropic" samples={[]} now={NOW_MS} />);

    expect(screen.getByText('At this pace it ends the window at 70%.')).toBeInTheDocument();
    expect(screen.getByText('10.0%/day, the average since the window opened')).toBeInTheDocument();
  });

  it('marks a window near its limit and one that is spent, in words too', () => {
    const { rerender } = render(
      <LimitCard
        limit={{ ...week, usedFraction: 0.92, status: 'warning' }}
        provider="anthropic"
        samples={[]}
        now={NOW_MS}
      />
    );

    expect(screen.getByRole('article')).toHaveAttribute('data-severity', 'warn');
    expect(screen.getByText('used, near its limit')).toHaveClass('text-warn');

    rerender(
      <LimitCard
        limit={{ ...week, usedFraction: 1, status: 'exhausted' }}
        provider="anthropic"
        samples={[sample(-10, 0.8), sample(0, 1)]}
        now={NOW_MS}
      />
    );

    expect(screen.getByRole('article')).toHaveAttribute('data-severity', 'danger');
    expect(screen.getByText('used, spent')).toHaveClass('text-danger');
    expect(screen.getByText('Spent. Nothing more until it resets.')).toBeInTheDocument();
    // A spent window is not filling, so no pace is given.
    expect(screen.queryByText(/over the last/)).not.toBeInTheDocument();
  });

  it('says so when there is nothing to read a pace from', () => {
    render(<LimitCard limit={{ ...week, windowSeconds: undefined }} provider="anthropic" samples={[]} now={NOW_MS} />);

    expect(screen.getByText('Not enough history yet to say where it is heading.')).toBeInTheDocument();
    expect(screen.queryByTestId('even-pace')).not.toBeInTheDocument();
    expect(screen.queryByText(/of the window gone/)).not.toBeInTheDocument();
  });

  it('says when the provider reports no amount', () => {
    render(
      <LimitCard
        limit={{ id: 'anthropic:5h', label: 'Claude 5 Hour', windowLabel: '5 Hour' }}
        provider="anthropic"
        samples={[]}
        now={NOW_MS}
      />
    );

    expect(screen.getByRole('article', { name: 'Claude 5 Hour' })).toHaveTextContent(
      '5 HourThe provider reports no amount for this window.'
    );
  });
});
