import { describe, expect, it } from 'vitest';
import { render } from '@/test-utils';
import { Sparkline } from './Sparkline';

const base = { start: 0, end: 100, line: 'stroke-anthropic', glow: 'text-anthropic-track' };

describe('Sparkline', () => {
  it('draws a line over a glow, edge to edge', () => {
    const { container } = render(
      <Sparkline
        {...base}
        points={[
          { time: 0, value: 0 },
          { time: 50, value: 0.25 },
          { time: 100, value: 0.5 },
        ]}
      />
    );

    const chart = container.querySelector('[data-chart]');
    expect(chart).toHaveAttribute('data-chart', 'history');
    expect(chart).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelector('[data-testid="head"]')).not.toBeInTheDocument();
    expect(container.querySelector('path:nth-of-type(2)')).toHaveAttribute(
      'd',
      'M0.00 40.00 L50.00 30.25 L100.00 20.50'
    );
  });

  it('marks the newest value with a dot when asked', () => {
    const { container } = render(
      <Sparkline
        {...base}
        head
        points={[
          { time: 0, value: 0 },
          { time: 100, value: 1 },
        ]}
      />
    );

    const dot = container.querySelector('[data-testid="head"]');
    expect(dot).toHaveClass('stroke-anthropic');
    expect(dot).toHaveAttribute('x1', '100');
    expect(dot).toHaveAttribute('y1', '1');
  });

  it('falls back to a level, without a line, when there is too little to draw', () => {
    const { container } = render(<Sparkline {...base} points={[{ time: 0, value: 0.4 }]} level={0.4} head />);

    expect(container.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'level');
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(container.querySelector('[data-testid="head"]')).not.toBeInTheDocument();
  });

  it('draws nothing without points or a level', () => {
    const { container } = render(<Sparkline {...base} points={[]} />);

    expect(container.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'none');
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
