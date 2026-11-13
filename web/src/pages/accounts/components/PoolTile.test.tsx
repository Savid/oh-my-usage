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
  used: 1.1,
  usedFraction: 0.55,
  severity: 'normal',
  nextReset: at(20 * HOUR),
  staggered: true,
};

describe('PoolTile', () => {
  it('shows how much is used across the seats and when the next reset comes', () => {
    render(<PoolTile pool={pool} now={NOW_MS} />);

    const tile = screen.getByRole('article', { name: 'Anthropic 7 Day' });
    expect(tile).toHaveAttribute('data-severity', 'normal');
    expect(tile).toHaveTextContent('Anthropic7 Day · 2 seats55%usednext reset 20h');
  });

  it('says when a single account resets, in days and hours', () => {
    render(<PoolTile pool={{ ...pool, seats: 1, staggered: false, nextReset: at(32 * HOUR) }} now={NOW_MS} />);

    const tile = screen.getByRole('article');
    expect(tile).toHaveTextContent('resets in 1d 8h');
    expect(tile).not.toHaveTextContent('seats');
  });

  it('says in words when a window is nearly or wholly spent', () => {
    const { rerender } = render(
      <PoolTile pool={{ ...pool, usedFraction: 0.92, severity: 'warn', nextReset: undefined }} now={NOW_MS} />
    );

    expect(screen.getByRole('article')).toHaveAttribute('data-severity', 'warn');
    expect(screen.getByText('used, near limit')).toBeInTheDocument();
    expect(screen.getByRole('article')).not.toHaveTextContent('reset');

    rerender(<PoolTile pool={{ ...pool, usedFraction: 1, severity: 'danger' }} now={NOW_MS} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('used, spent')).toBeInTheDocument();
  });
});
