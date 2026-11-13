import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { UsageSample } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { LimitCard } from './LimitCard';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function sample(hours: number, usedFraction: number): UsageSample {
  return { at: at(hours * HOUR), limitId: 'anthropic:7d', label: 'Claude 7 Day', usedFraction };
}

const meta = {
  title: 'Pages/Accounts/Components/LimitCard',
  component: LimitCard,
  args: {
    limit: {
      id: 'anthropic:7d',
      label: 'Claude 7 Day',
      windowLabel: '7 Day',
      usedFraction: 0.5,
      status: 'ok',
      resetsAt: at(2 * DAY),
      windowSeconds: 7 * 24 * 3600,
    },
    provider: 'anthropic',
    samples: [sample(-12, 0.38), sample(0, 0.5)],
    now: NOW_MS,
  },
  decorators: [
    Story => (
      <div className="flex w-104">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LimitCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article', { name: 'Claude 7 Day' })).toHaveTextContent('50%');
    await expect(canvas.getByText('At this pace it ends the window at 98%.')).toBeInTheDocument();
  },
};

export const RunsOutEarly: Story = {
  args: { samples: [sample(-10, 0.3), sample(0, 0.5)] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/At this pace it runs out in 1d 1h/)).toBeInTheDocument();
  },
};

export const NearLimit: Story = {
  args: { limit: { ...meta.args.limit, usedFraction: 0.92, status: 'warning' }, samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article')).toHaveAttribute('data-severity', 'warn');
  },
};

export const Spent: Story = {
  args: { limit: { ...meta.args.limit, usedFraction: 1, status: 'exhausted' }, samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Spent. Nothing more until it resets.')).toBeInTheDocument();
  },
};

export const NoHistory: Story = {
  args: { limit: { ...meta.args.limit, windowSeconds: undefined }, samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Not enough history yet to say where it is heading.')).toBeInTheDocument();
  },
};

export const NoAmount: Story = {
  args: { limit: { id: 'anthropic:5h', label: 'Claude 5 Hour', windowLabel: '5 Hour' }, samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('The provider reports no amount for this window.')).toBeInTheDocument();
  },
};
