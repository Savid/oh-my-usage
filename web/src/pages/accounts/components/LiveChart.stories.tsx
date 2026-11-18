import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { liveView } from '@/lib/live';
import { quietTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { LiveChart } from './LiveChart';

const view = liveView(trafficFixture.live);

const meta = {
  title: 'Pages/Accounts/Components/LiveChart',
  component: LiveChart,
  args: { view, span: 10 * 60_000, onScrub: fn(), className: 'h-28 w-176' },
  decorators: [
    Story => (
      <div className="inline-block rounded-md border border-border bg-surface">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LiveChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'live');
    await expect(canvasElement.querySelector('[data-testid="head"]')).toBeInTheDocument();
  },
};

/** The last hour by minute, as the chart shows it until a minute is live. */
export const LastHour: Story = {
  args: { view: liveView(trafficFixture.minutes), span: 60 * 60_000 },
};

/** A point picked: a hairline down through it and a dot on the top line. */
export const Scrubbed: Story = {
  args: { scrub: view.times.length - 40 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-testid="crosshair"]')).toBeInTheDocument();
  },
};

/** Nothing passing: a flat line along the bottom, its newest point still pinging. */
export const Quiet: Story = {
  args: { view: liveView(quietTrafficFixture.live) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-testid="baseline"]')).toBeInTheDocument();
  },
};

/** Not a step read in full yet: nothing to draw. */
export const Empty: Story = {
  args: { view: liveView({ ...quietTrafficFixture.live, steps: 1 }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'none');
  },
};
