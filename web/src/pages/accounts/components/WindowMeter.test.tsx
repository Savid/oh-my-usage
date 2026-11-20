import type { JSX, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { Limit, UsageSample } from '@/api';
import { render, screen } from '@/test-utils';
import { at, NOW_MS } from '@/test-utils/time';
import { WindowMeter } from './WindowMeter';

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

/** A meter is a line of a list. */
function list(meter: ReactNode): JSX.Element {
  return <ul>{meter}</ul>;
}

describe('WindowMeter', () => {
  it('shows what is used, when it resets and that it will see the window out', () => {
    const { container } = render(
      list(<WindowMeter limit={week} provider="anthropic" samples={[sample(-12, 0.38), sample(0, 0.5)]} now={NOW_MS} />)
    );

    const meter = screen.getByRole('listitem', { name: 'Claude 7 Day' });
    expect(meter).toHaveAttribute('data-severity', 'normal');
    expect(meter).toHaveTextContent('7 Day50% used, 71% of the window gonein 2d until it resets');
    // A few words on the line, the whole sentence on hover and to a screen reader.
    const outlook = screen.getByTitle('At this pace it ends the window at 98%. 1.0%/h over the last 12h.');
    expect(outlook).toHaveTextContent('Ends the window near 98% · 1.0%/h');
    expect(outlook).toHaveClass('text-muted');

    // The meter wears the provider's colour, with a tick where an even pace would be.
    expect(container.querySelector('rect.fill-anthropic')).toHaveAttribute('width', '50');
    expect(Number(screen.getByTestId('even-pace').getAttribute('x1'))).toBeCloseTo((5 / 7) * 100);
  });

  it('warns when it runs out before it resets', () => {
    render(
      list(<WindowMeter limit={week} provider="anthropic" samples={[sample(-10, 0.3), sample(0, 0.5)]} now={NOW_MS} />)
    );

    const outlook = screen.getByTitle(
      'At this pace it runs out in 1d 1h, 23h before it resets. 2.0%/h over the last 10h.'
    );
    expect(outlook).toHaveClass('text-warn');
    expect(outlook).toHaveTextContent('▲ Out in 1d 1h, 23h before it resets · 2.0%/h');
  });

  it('reads the pace from the window itself when no usage is recorded', () => {
    render(list(<WindowMeter limit={week} provider="anthropic" samples={[]} now={NOW_MS} />));

    expect(
      screen.getByTitle('At this pace it ends the window at 70%. 10.0%/day, the average since the window opened.')
    ).toBeInTheDocument();
  });

  it('marks a window near its limit and one that is spent, in words too', () => {
    const { rerender } = render(
      list(
        <WindowMeter
          limit={{ ...week, usedFraction: 0.92, status: 'warning' }}
          provider="anthropic"
          samples={[]}
          now={NOW_MS}
        />
      )
    );

    expect(screen.getByRole('listitem')).toHaveAttribute('data-severity', 'warn');
    expect(screen.getByText('92%', { exact: false })).toHaveClass('text-warn');
    expect(screen.getByRole('listitem')).toHaveTextContent('▲92% used, near its limit');

    rerender(
      list(
        <WindowMeter
          limit={{ ...week, usedFraction: 1, status: 'exhausted' }}
          provider="anthropic"
          samples={[sample(-10, 0.8), sample(0, 1)]}
          now={NOW_MS}
        />
      )
    );

    expect(screen.getByRole('listitem')).toHaveAttribute('data-severity', 'danger');
    expect(screen.getByRole('listitem')).toHaveTextContent('■100% used, spent');
    expect(screen.getByTitle('Spent. Nothing more until it resets.')).toHaveClass('text-danger');
    // A spent window is not filling, so no pace is given.
    expect(screen.queryByText(/over the last/)).not.toBeInTheDocument();
  });

  it('says so when there is nothing to read a pace from', () => {
    render(
      list(<WindowMeter limit={{ ...week, windowSeconds: undefined }} provider="anthropic" samples={[]} now={NOW_MS} />)
    );

    expect(screen.getByTitle('Not enough history yet to say where it is heading.')).toHaveTextContent('No pace yet');
    expect(screen.queryByTestId('even-pace')).not.toBeInTheDocument();
    expect(screen.queryByText(/of the window gone/)).not.toBeInTheDocument();
  });

  it('says when the provider reports no amount', () => {
    render(
      list(
        <WindowMeter
          limit={{ id: 'anthropic:5h', label: 'Claude 5 Hour', windowLabel: '5 Hour' }}
          provider="anthropic"
          samples={[]}
          now={NOW_MS}
        />
      )
    );

    expect(screen.getByRole('listitem', { name: 'Claude 5 Hour' })).toHaveTextContent(
      '5 HourThe provider reports no amount for this window.'
    );
  });
});
