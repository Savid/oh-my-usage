import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@/test-utils';
import { quietTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { at } from '@/test-utils/time';
import { TrafficBars } from './TrafficBars';

const HOUR = 3_600_000;

describe('TrafficBars', () => {
  it('draws a bar per step with traffic, stacked by provider in its colour', () => {
    const { container } = render(<TrafficBars series={trafficFixture.minutes} label="Traffic by minute" />);

    expect(screen.getByRole('img', { name: 'Traffic by minute' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-step]')).toHaveLength(60);
    // Step 1 has both providers: Anthropic at the foot, Codex on top of it.
    const parts = container.querySelectorAll('[data-step="1"] rect');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveClass('fill-anthropic');
    expect(parts[1]).toHaveClass('fill-openai');
    // Step 0 is quiet for both.
    expect(container.querySelectorAll('[data-step="0"] rect')).toHaveLength(0);
  });

  it('reads out the latest full step, then the one under the pointer', () => {
    render(<TrafficBars series={trafficFixture.minutes} label="Traffic by minute" />);

    expect(screen.getByText(/^Latest /)).toBeInTheDocument();
    const legend = within(screen.getByRole('list'));
    // The step before the one still filling: 58.
    expect(legend.getByText('Anthropic').nextElementSibling).toHaveTextContent(
      `$${trafficFixture.minutes.providers[0]!.costUsd[58]!.toFixed(2)}`
    );

    const plot = screen.getByTestId('plot');
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 600, 80));

    // A tenth of the way along 60 steps: step 6.
    fireEvent.pointerMove(plot, { clientX: 165 });

    expect(screen.getByText(/^At /)).toBeInTheDocument();
    expect(screen.getByTestId('highlight')).toBeInTheDocument();
    expect(legend.getByText('Anthropic').nextElementSibling).toHaveTextContent(
      `$${trafficFixture.minutes.providers[0]!.costUsd[6]!.toFixed(2)}`
    );

    fireEvent.pointerLeave(plot);

    expect(screen.getByText(/^Latest /)).toBeInTheDocument();
    expect(screen.queryByTestId('highlight')).not.toBeInTheDocument();
  });

  it('marks where measuring began and calls the steps before it estimates', () => {
    render(<TrafficBars series={trafficFixture.hours} label="Traffic by hour" measuredSince={at(-72 * HOUR)} />);

    expect(screen.getByTestId('measured-from')).toHaveTextContent('measured from here');
    expect(screen.queryByText('estimate')).not.toBeInTheDocument();

    const plot = screen.getByTestId('plot');
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 168, 80));
    fireEvent.pointerMove(plot, { clientX: 10 });

    expect(screen.getByText('estimate')).toBeInTheDocument();
  });

  it('leaves the mark out when everything drawn was measured', () => {
    render(<TrafficBars series={trafficFixture.minutes} label="Traffic by minute" measuredSince={at(-72 * HOUR)} />);

    expect(screen.queryByTestId('measured-from')).not.toBeInTheDocument();
  });

  it('says when nothing passed', () => {
    const { container } = render(<TrafficBars series={quietTrafficFixture.minutes} label="Traffic by minute" />);

    expect(screen.getByText('No traffic in this period.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-step] rect')).toHaveLength(0);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
