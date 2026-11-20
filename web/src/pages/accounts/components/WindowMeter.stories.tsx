import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { UsageSample } from '@/api';
import { at, NOW_MS } from '@/test-utils/time';
import { WindowMeter } from './WindowMeter';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function sample(hours: number, usedFraction: number): UsageSample {
  return { at: at(hours * HOUR), limitId: 'anthropic:7d', label: 'Claude 7 Day', usedFraction };
}

const meta = {
  title: 'Pages/Accounts/Components/WindowMeter',
  component: WindowMeter,
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
      <ul className="flex w-120 flex-col rounded-md border border-border bg-surface px-4 py-3">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof WindowMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem', { name: 'Claude 7 Day' })).toHaveTextContent('50%');
    await expect(canvas.getByText('Ends the window near 98%')).toBeInTheDocument();
  },
};

export const RunsOutEarly: Story = {
  args: { samples: [sample(-10, 0.3), sample(0, 0.5)] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Out in 1d 1h/)).toBeInTheDocument();
  },
};

export const NearLimit: Story = {
  args: { limit: { ...meta.args.limit, usedFraction: 0.92, status: 'warning' }, samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem')).toHaveAttribute('data-severity', 'warn');
  },
};

export const Spent: Story = {
  args: { limit: { ...meta.args.limit, usedFraction: 1, status: 'exhausted' }, samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle('Spent. Nothing more until it resets.')).toBeInTheDocument();
  },
};

export const NoHistory: Story = {
  args: { limit: { ...meta.args.limit, windowSeconds: undefined }, samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No pace yet')).toBeInTheDocument();
  },
};

export const NoAmount: Story = {
  args: { limit: { id: 'anthropic:5h', label: 'Claude 5 Hour', windowLabel: '5 Hour' }, samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('The provider reports no amount for this window.')).toBeInTheDocument();
  },
};
