import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { at, NOW_MS } from '@/test-utils/time';
import { UsageMeter } from './UsageMeter';

const HOUR = 3_600_000;

const meta = {
  title: 'Pages/Accounts/Components/UsageMeter',
  component: UsageMeter,
  parameters: { layout: 'padded' },
  args: {
    limit: { id: 'anthropic:7d', label: 'Claude 7 Day', usedFraction: 0.42, status: 'ok', resetsAt: at(21 * HOUR) },
    now: NOW_MS,
  },
  decorators: [
    Story => (
      <div className="max-w-narrow rounded-md border border-border bg-surface p-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UsageMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('meter', { name: 'Claude 7 Day' })).toHaveAttribute('aria-valuenow', '42');
    await expect(canvas.getByText('Resets in 21 h')).toBeInTheDocument();
  },
};

export const NearLimit: Story = {
  args: { limit: { id: 'anthropic:7d', label: 'Claude 7 Day', usedFraction: 0.92, resetsAt: at(3 * HOUR) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('meter')).toHaveAttribute('data-severity', 'warn');
    await expect(canvas.getByText('Near its limit, resets in 3 h')).toBeInTheDocument();
  },
};

export const UsedUp: Story = {
  args: {
    limit: {
      id: 'anthropic:5h',
      label: 'Claude 5 Hour',
      usedFraction: 1,
      status: 'exhausted',
      resetsAt: at(45 * 60_000),
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('meter')).toHaveAttribute('data-severity', 'danger');
    await expect(canvas.getByText('Used up, resets in 45 min')).toBeInTheDocument();
  },
};

export const NotReported: Story = {
  args: { limit: { id: 'anthropic:5h', label: 'Claude 5 Hour' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('not reported')).toBeInTheDocument();
  },
};

export const Unused: Story = {
  args: { limit: { id: 'weekly', label: 'Weekly limit', usedFraction: 0 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  },
};

export const Overage: Story = {
  args: { limit: { id: 'credits', label: 'A limit with a long name that wraps on a narrow card', usedFraction: 1.37 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('137%')).toBeInTheDocument();
  },
};
