import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test-utils';
import { RollingNumber } from './RollingNumber';

describe('RollingNumber', () => {
  it('reads the figure whole and shows each digit on its own wheel', () => {
    const { container } = render(<RollingNumber value="1,284" />);

    expect(screen.getByText('1,284')).toHaveClass('sr-only');
    const wheels = container.querySelectorAll('[aria-hidden="true"] .flex-col');
    expect(wheels).toHaveLength(4);
    // Each wheel is moved up to its digit: a tenth of the column a step.
    expect(wheels[0]).toHaveClass('-translate-y-1/10');
    expect(wheels[3]).toHaveClass('-translate-y-2/5');
  });

  it('turns the wheels when the figure changes', () => {
    const { container, rerender } = render(<RollingNumber value="296" />);

    rerender(<RollingNumber value="301" />);

    expect(screen.getByText('301')).toBeInTheDocument();
    const wheels = container.querySelectorAll('[aria-hidden="true"] .flex-col');
    expect([...wheels].map(wheel => wheel.className.match(/-?translate-y-\S+/)?.[0])).toEqual([
      '-translate-y-3/10',
      'translate-y-0',
      '-translate-y-1/10',
    ]);
  });
});
