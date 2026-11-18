import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import type { Pool } from '@/lib/pools';
import { at, NOW_MS } from '@/test-utils/time';
import { PoolMeter } from './PoolMeter';

const HOUR = 3_600_000;

const pool: Pool = {
  provider: 'anthropic',
  limitId: 'anthropic:7d',
  label: '7 Day',
  seats: 8,
  used: 3.4,
  usedFraction: 0.425,
  severity: 'normal',
  nextReset: at(2 * HOUR),
  staggered: true,
};

function renderMeter(overrides: Partial<Pool> = {}): ReturnType<typeof render> {
  return render(
    <ul>
      <PoolMeter pool={{ ...pool, ...overrides }} now={NOW_MS} />
    </ul>
  );
}

describe('PoolMeter', () => {
  it('reads a provider as one line: its window, how much is used and when the next account resets', () => {
    const { container } = renderMeter();

    const line = screen.getByRole('listitem', { name: 'Anthropic 7 Day' });
    expect(line).toHaveAttribute('data-severity', 'normal');
    expect(line).toHaveTextContent('Anthropic7 Day · 8 seats43%usednext 2h');
    // The meter fills to the share used, in the provider's colour.
    expect(container.querySelector('rect.fill-anthropic')).toHaveAttribute('width', '42.5');
  });

  it('says when the reset is, not the next one, when every account resets together', () => {
    renderMeter({ seats: 1, staggered: false, nextReset: at(45 * HOUR) });

    expect(screen.getByRole('listitem')).toHaveTextContent('7 Day43%usedin 1d 21h');
  });

  it('marks a pool near its limit, and one that is spent, in words as well as colour', () => {
    const { unmount } = renderMeter({ usedFraction: 0.87, severity: 'warn' });
    expect(screen.getByRole('listitem')).toHaveTextContent('▲87%used, near limit');
    unmount();

    renderMeter({ usedFraction: 1.2, severity: 'danger' });
    expect(screen.getByRole('listitem')).toHaveTextContent('■120%used, spent');
    // The meter stops full.
    expect(document.querySelector('rect.fill-anthropic')).toHaveAttribute('width', '100');
  });

  it('leaves the reset out when no account gave one', () => {
    renderMeter({ nextReset: undefined, staggered: false });

    expect(screen.getByRole('listitem')).not.toHaveTextContent(/next|in \d/);
  });
});
