import { describe, expect, it } from 'vitest';
import type { Pool } from '@/lib/pools';
import { render, screen } from '@/test-utils';
import { at, NOW_MS } from '@/test-utils/time';
import { PoolTile } from './PoolTile';

const HOUR = 3_600_000;

const pool: Pool = {
  provider: 'anthropic',
  limitId: 'anthropic:7d',
  label: '7 Day',
  seats: 2,
  left: 0.9,
  leftFraction: 0.45,
  severity: 'normal',
  nextReset: at(20 * HOUR),
  staggered: true,
};

describe('PoolTile', () => {
  it('shows how much is left across the seats and when the next reset comes', () => {
    render(<PoolTile pool={pool} now={NOW_MS} />);

    const tile = screen.getByRole('article', { name: 'Anthropic 7 Day' });
    expect(tile).toHaveAttribute('data-severity', 'normal');
    expect(tile).toHaveTextContent('Anthropic7 Day · 2 seats45%leftnext reset 20h');
  });

  it('says when a single account resets, in days and hours', () => {
    render(<PoolTile pool={{ ...pool, seats: 1, staggered: false, nextReset: at(32 * HOUR) }} now={NOW_MS} />);

    const tile = screen.getByRole('article');
    expect(tile).toHaveTextContent('resets in 1d 8h');
    expect(tile).not.toHaveTextContent('seats');
  });

  it('says in words when little or nothing is left', () => {
    const { rerender } = render(
      <PoolTile pool={{ ...pool, leftFraction: 0.08, severity: 'warn', nextReset: undefined }} now={NOW_MS} />
    );

    expect(screen.getByRole('article')).toHaveAttribute('data-severity', 'warn');
    expect(screen.getByText('left, low')).toBeInTheDocument();
    expect(screen.getByRole('article')).not.toHaveTextContent('reset');

    rerender(<PoolTile pool={{ ...pool, leftFraction: 0, severity: 'danger' }} now={NOW_MS} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('left, spent')).toBeInTheDocument();
  });
});
