import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@/test-utils';
import { liveView } from '@/lib/live';
import { quietTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { LiveChart } from './LiveChart';

const view = liveView(trafficFixture.live);
const SPAN = 10 * 60_000;

describe('LiveChart', () => {
  it('stacks each provider in its colour and marks the newest point', () => {
    const { container } = render(<LiveChart view={view} span={SPAN} onScrub={() => {}} />);

    const chart = container.querySelector('[data-chart]');
    expect(chart).toHaveAttribute('data-chart', 'live');
    expect(chart).toHaveAttribute('aria-hidden', 'true');
    const lines = [...container.querySelectorAll('path[data-provider]')];
    expect(lines.map(line => line.getAttribute('data-provider'))).toEqual(['anthropic', 'openai-codex']);
    expect(lines[0]).toHaveClass('stroke-anthropic');
    // The head wears the colour of the top layer.
    expect(container.querySelector('[data-testid="head"]')).toHaveClass('stroke-openai');
    expect(container.querySelector('[data-testid="crosshair"]')).not.toBeInTheDocument();
  });

  it('picks the point nearest the pointer, and nothing once it leaves', () => {
    const onScrub = vi.fn();
    const { container } = render(<LiveChart view={view} span={SPAN} onScrub={onScrub} />);
    const chart = container.querySelector<HTMLElement>('[data-chart]');
    if (!chart) throw new Error('no chart');
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 100));

    // The newest point is 1.5% short of the right edge.
    fireEvent.pointerMove(chart, { clientX: 985 });
    expect(onScrub).toHaveBeenLastCalledWith(view.times.length - 1);

    // Left of the first point there is nothing to read.
    const sparse = { ...view, times: view.times.slice(-10), totals: view.totals.slice(-10) };
    const { container: other } = render(<LiveChart view={sparse} span={SPAN} onScrub={onScrub} />);
    const short = other.querySelector<HTMLElement>('[data-chart]');
    if (!short) throw new Error('no chart');
    vi.spyOn(short, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 100));
    fireEvent.pointerMove(short, { clientX: 10 });
    expect(onScrub).toHaveBeenLastCalledWith(undefined);

    fireEvent.pointerLeave(chart);
    expect(onScrub).toHaveBeenLastCalledWith(undefined);
  });

  it('draws a hairline through the point being read', () => {
    const { container } = render(<LiveChart view={view} span={SPAN} scrub={5} onScrub={() => {}} />);

    expect(container.querySelector('[data-testid="crosshair"]')).toBeInTheDocument();
  });

  it('lays a flat line along the bottom with nothing passing, its newest point still marked', () => {
    const { container } = render(
      <LiveChart view={liveView(quietTrafficFixture.live)} span={SPAN} onScrub={() => {}} />
    );

    expect(container.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'live');
    expect(container.querySelector('path[data-provider]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="baseline"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="head"]')).toHaveClass('stroke-border-strong');
  });

  it('draws nothing before a step is read in full', () => {
    const { container } = render(
      <LiveChart view={liveView({ ...quietTrafficFixture.live, steps: 1 })} span={SPAN} onScrub={() => {}} />
    );

    expect(container.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'none');
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
