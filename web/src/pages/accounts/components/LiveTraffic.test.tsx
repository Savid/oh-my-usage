import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@/test-utils';
import { quietTrafficFixture, staleTrafficFixture, trafficFixture, warmingTrafficFixture } from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';
import { liveView } from '@/lib/live';
import { LiveTraffic } from './LiveTraffic';

/** The figure as assistive technology reads it: the digits drawn beside it are hidden. */
function rate(): string {
  return screen.getByText(/^[\d,.K]+$/, { selector: '.sr-only' }).textContent ?? '';
}

describe('LiveTraffic', () => {
  it("leads with the rate now and each provider's part of it, over the last ten minutes", () => {
    const { container } = render(<LiveTraffic traffic={trafficFixture} monthlyUsd={780} now={NOW_MS} />);

    const view = liveView(trafficFixture.live);
    const total = Math.round(view.totals.at(-1) ?? 0);
    expect(rate()).toBe(total.toLocaleString('en-US'));
    expect(screen.getByText('tokens out a second')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Traffic' })).toHaveAttribute('href', '/traffic');
    expect(screen.getByText('Live')).toHaveAttribute('data-status', 'live');
    expect(screen.getByText(/read 8s ago · last 10 min/)).toBeInTheDocument();

    const legend = within(screen.getByRole('list', { name: 'By provider' })).getAllByRole('listitem');
    expect(legend.map(item => item.textContent)).toEqual([
      expect.stringMatching(/^Anthropic[\d,]+\/s$/),
      expect.stringMatching(/^OpenAI Codex[\d,]+\/s$/),
    ]);
    expect(container.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'live');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('adds up the last hour, day and week at API prices, and weighs the week against the subscriptions', () => {
    render(<LiveTraffic traffic={trafficFixture} monthlyUsd={780} now={NOW_MS} />);

    // $780 a month is $180 a week; the week's traffic at API prices is $1,786.
    expect(screen.getByText('$249').parentElement).toHaveTextContent(
      '$249 last hour · 24h $1,068 · 7d $1,786 at API prices · 9.9× the subscriptions'
    );
  });

  it('shows the cache in place of the value when nothing is priced', () => {
    render(<LiveTraffic traffic={trafficFixture} now={NOW_MS} />);

    expect(screen.queryByText(/the subscriptions/)).not.toBeInTheDocument();
    expect(screen.getByText('$249').parentElement).toHaveTextContent(/at API prices · \d+% cached$/);
  });

  it('shows the last hour by minute until a minute is live', () => {
    render(<LiveTraffic traffic={warmingTrafficFixture} now={NOW_MS} />);

    expect(screen.getByText(/last hour by minute/)).toBeInTheDocument();
    const minutes = liveView(warmingTrafficFixture.minutes);
    expect(rate()).toBe(Math.round(minutes.totals.at(-1) ?? 0).toLocaleString('en-US'));
  });

  it('reads the point under the pointer, and lets go when it leaves', () => {
    const { container } = render(<LiveTraffic traffic={trafficFixture} now={NOW_MS} />);
    const chart = container.querySelector<HTMLElement>('[data-chart]');
    if (!chart) throw new Error('no chart');
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 100));

    // The chart shows ten minutes, its newest point 1.5% short of the right edge: halfway across is
    // 48.5% of ten minutes before it, 291 seconds, and the nearest point is 58 steps of five back.
    fireEvent.pointerMove(chart, { clientX: 500 });

    const view = liveView(trafficFixture.live);
    const index = view.times.length - 1 - 58;
    expect(screen.getByText(/5m before$/)).toBeInTheDocument();
    expect(rate()).toBe(Math.round(view.totals[index] ?? 0).toLocaleString('en-US'));
    expect(container.querySelector('[data-testid="crosshair"]')).toBeInTheDocument();

    fireEvent.pointerLeave(chart);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="crosshair"]')).not.toBeInTheDocument();
  });

  it('says when the broker stopped answering and how old the figures are', () => {
    render(<LiveTraffic traffic={staleTrafficFixture} now={NOW_MS} />);

    expect(screen.getByText('Not current')).toHaveAttribute('data-status', 'down');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The broker is not answering, so this is not current: last read 12m ago. GET /v1/usage/clients: connection refused'
    );
  });

  it('calls out traffic that has not been read for a while', () => {
    render(<LiveTraffic traffic={{ ...trafficFixture, updatedAt: at(-5 * 60_000) }} now={NOW_MS} />);

    expect(screen.getByText('Stale')).toHaveAttribute('data-status', 'stale');
    expect(screen.getByText(/read 5m ago/)).toBeInTheDocument();
  });

  it('waits for the first reading, and reads nothing as nothing', () => {
    const { container } = render(
      <LiveTraffic traffic={{ ...quietTrafficFixture, updatedAt: undefined }} now={NOW_MS} />
    );

    expect(screen.getByText('Waiting')).toHaveAttribute('data-status', 'waiting');
    expect(screen.getByText(/no reading yet/)).toBeInTheDocument();
    expect(rate()).toBe('0');
    expect(screen.queryByRole('list', { name: 'By provider' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-chart]')).not.toBeInTheDocument();
  });

  it('reads a quiet gateway as quiet: nothing a second, along a flat line', () => {
    const { container } = render(<LiveTraffic traffic={quietTrafficFixture} now={NOW_MS} />);

    expect(rate()).toBe('0');
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="baseline"]')).toBeInTheDocument();
  });
});
