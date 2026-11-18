import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@/test-utils';
import { quietTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { at } from '@/test-utils/time';
import { formatCount } from '@/lib/format';
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

  it('measures the bars in the metric asked for, and says it', () => {
    const { container } = render(
      <TrafficBars series={trafficFixture.minutes} label="Tokens out by minute" metric="output" />
    );

    const claude = trafficFixture.minutes.providers[0]!;
    // The readout leads with the step's tokens out, and still gives its cost beside.
    expect(screen.getByText('tokens out').parentElement).toHaveTextContent(
      `${formatCount(claude.outputTokens[58]! + trafficFixture.minutes.providers[1]!.outputTokens[58]!)} tokens out`
    );
    expect(screen.getByText(/^\$[\d.]+ · \d+ req · /)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-step="1"] rect')).toHaveLength(2);
  });

  it('draws the cache share as one bar a step, from nothing to all of it', () => {
    const { container } = render(
      <TrafficBars series={trafficFixture.minutes} label="Cache share by minute" metric="cache" />
    );

    const bars = container.querySelectorAll('[data-step="1"] rect');
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveClass('fill-meter');
    // A quiet step sent nothing, so it has no share to draw.
    expect(container.querySelectorAll('[data-step="0"] rect')).toHaveLength(0);
    expect(screen.getByText('100%')).toBeInTheDocument();
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

  it('breaks the step down by kind of token when it has the room', () => {
    const { rerender } = render(<TrafficBars series={trafficFixture.minutes} label="Traffic by minute" />);

    const kinds = screen
      .getAllByRole('term')
      .map(term => `${term.textContent} ${term.nextElementSibling?.textContent}`);
    // Step 58: Anthropic at $6.21 and Codex at $0.86, each token kind a fixed multiple of the cost.
    expect(kinds).toEqual(['Input 85', 'Output 38.9K', 'Cache read 7.42M', 'Cache write 311K']);

    rerender(<TrafficBars series={trafficFixture.minutes} label="Traffic by minute" size="band" />);

    expect(screen.queryByRole('term')).not.toBeInTheDocument();
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
