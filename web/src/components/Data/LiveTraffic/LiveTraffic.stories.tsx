import { useEffect, useState, type JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent } from 'storybook/test';
import type { Traffic, TrafficSeries } from '@/api';
import { staleTrafficFixture, trafficFixture, quietTrafficFixture, warmingTrafficFixture } from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';
import { LiveTraffic } from './LiveTraffic';

const STEP = 5000;

/** A provider's output in one five-second step: a rolling swell with a burst now and then. */
function tokensAt(step: number, perStep: number, phase: number): number {
  const swell = 0.6 + 0.4 * Math.sin((step + phase) / 9) + 0.25 * Math.sin((step + phase) / 2.3);
  const burst = (step + phase) % 13 === 0 ? 2.2 : 1;
  return Math.max(0, Math.round(perStep * swell * burst));
}

function provider(name: string, outputTokens: number[]): TrafficSeries['providers'][number] {
  return {
    provider: name,
    outputTokens,
    requests: outputTokens.map(tokens => Math.round(tokens / 900)),
    inputTokens: outputTokens.map(tokens => Math.round(tokens / 400)),
    cacheReadTokens: outputTokens.map(tokens => tokens * 190),
    cacheWriteTokens: outputTokens.map(tokens => tokens * 8),
    costUsd: outputTokens.map(tokens => tokens * 0.00012),
  };
}

/** The traffic `tick` readings on from the fixture, a reading every five seconds. */
function streamed(tick: number): Traffic {
  const steps = trafficFixture.live.steps;
  const series = (perStep: number, phase: number): number[] =>
    Array.from({ length: steps }, (_, index) => tokensAt(tick + index, perStep, phase));
  return {
    ...trafficFixture,
    updatedAt: at(tick * STEP - 3000),
    live: {
      ...trafficFixture.live,
      start: new Date(Date.parse(trafficFixture.live.start) + tick * STEP).toISOString(),
      providers: [provider('anthropic', series(1100, 0)), provider('openai-codex', series(260, 40))],
    },
  };
}

function Streaming(): JSX.Element {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 2000);
    return () => clearInterval(timer);
  }, []);

  return <LiveTraffic traffic={streamed(tick)} monthlyUsd={780} now={NOW_MS + tick * STEP} />;
}

const many: Traffic = {
  ...trafficFixture,
  live: {
    ...trafficFixture.live,
    providers: [
      ...trafficFixture.live.providers,
      ...['opencode-go', 'openrouter', 'google'].map((name, index) =>
        provider(
          name,
          Array.from({ length: trafficFixture.live.steps }, (_, step) => tokensAt(step, 120 - index * 30, index * 7))
        )
      ),
    ],
  },
};

const meta = {
  title: 'Components/Data/LiveTraffic',
  component: LiveTraffic,
  args: { traffic: trafficFixture, monthlyUsd: 780, now: NOW_MS },
  decorators: [
    Story => (
      <div className="flex w-176 overflow-hidden rounded-md border border-border bg-surface">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LiveTraffic>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('region', { name: 'Traffic' })).toBeVisible();
    await expect(canvas.getByText('Live')).toBeVisible();
    await expect(canvas.getByText(/the subscriptions/)).toBeVisible();
    await expect(canvasElement.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'live');
  },
};

/** A reading every two seconds, as if five had passed: the chart glides left and the figures roll. */
export const Live: Story = {
  render: () => <Streaming />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'live');
  },
};

/** No account has a price, so the cache is shown in place of the value. */
export const Unpriced: Story = {
  args: { monthlyUsd: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/cached/)).toBeVisible();
  },
};

/** The daemon has only just started: until a minute is live, the chart shows the last hour by minute. */
export const Warming: Story = {
  args: { traffic: warmingTrafficFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/last hour by minute/)).toBeVisible();
  },
};

export const Waiting: Story = {
  args: { traffic: { ...quietTrafficFixture, updatedAt: undefined } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Waiting')).toBeVisible();
  },
};

export const Quiet: Story = {
  args: { traffic: quietTrafficFixture },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText(/last hour · 24h/)).toHaveTextContent('$0 last hour · 24h $0 · 7d $0');
    await expect(canvasElement.querySelector('[data-testid="baseline"]')).toBeInTheDocument();
  },
};

/** Not read for five minutes: the figures are called stale. */
export const Stale: Story = {
  args: { traffic: { ...trafficFixture, updatedAt: at(-5 * 60_000) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Stale')).toBeVisible();
  },
};

export const BrokerUnreachable: Story = {
  args: { traffic: staleTrafficFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('last read 12m ago');
  },
};

/** More providers than the legend names: the rest are added up. */
export const ManyProviders: Story = {
  args: { traffic: many },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/\+2 more/)).toBeVisible();
  },
};

/** Picking what to show redraws the chart, the figure and each provider's part for it. */
export const MetricInteraction: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /^Cost/ }));
    await expect(canvas.getByText('an hour at API prices')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /^Cached/ }));
    await expect(canvas.getByText('of input read from a cache')).toBeVisible();
  },
};

/** Moving the pointer over the chart reads the point under it. */
export const ScrubInteraction: Story = {
  play: async ({ canvas, canvasElement }) => {
    const chart = canvasElement.querySelector('[data-chart]');
    if (!chart) throw new Error('no chart');
    const box = chart.getBoundingClientRect();

    fireEvent.pointerMove(chart, { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 });
    await expect(await canvas.findByText(/before$/)).toBeVisible();
    await expect(canvasElement.querySelector('[data-testid="crosshair"]')).toBeInTheDocument();

    // React hears a pointer leaving through the pointerout it bubbles.
    fireEvent.pointerOut(chart, { relatedTarget: canvasElement });
    await expect(await canvas.findByText('Live')).toBeVisible();
  },
};
