import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { at, NOW_MS } from '@/test-utils/time';
import { PoolMeter } from './PoolMeter';

const HOUR = 3_600_000;

const meta = {
  title: 'Pages/Accounts/Components/PoolMeter',
  component: PoolMeter,
  args: {
    pool: {
      provider: 'anthropic',
      limitId: 'anthropic:7d',
      label: '7 Day',
      seats: 8,
      used: 3.4,
      usedFraction: 0.42,
      severity: 'normal',
      nextReset: at(2 * HOUR),
      staggered: true,
    },
    now: NOW_MS,
  },
  decorators: [
    Story => (
      <ul className="w-120 rounded-md border border-border bg-surface px-4 py-3">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof PoolMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem', { name: 'Anthropic 7 Day' })).toHaveTextContent('42%');
    await expect(canvas.getByText('2h')).toBeInTheDocument();
  },
};

/** One account, one reset time: it says when, not when the next one is. */
export const OneSeat: Story = {
  args: {
    pool: {
      provider: 'openai-codex',
      limitId: 'codex:7d',
      label: '7 days',
      seats: 1,
      used: 0.22,
      usedFraction: 0.22,
      severity: 'normal',
      nextReset: at(45 * HOUR),
      staggered: false,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem')).toHaveTextContent('in 1d 21h');
  },
};

export const NearLimit: Story = {
  args: { pool: { ...meta.args.pool, used: 7, usedFraction: 0.87, severity: 'warn' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('used, near limit')).toBeInTheDocument();
  },
};

export const Spent: Story = {
  args: { pool: { ...meta.args.pool, used: 8, usedFraction: 1, severity: 'danger' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('used, spent')).toBeInTheDocument();
  },
};

/** No account gave a reset time. */
export const NoReset: Story = {
  args: { pool: { ...meta.args.pool, nextReset: undefined, staggered: false } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/^(in|next) /)).not.toBeInTheDocument();
  },
};

export const LongName: Story = {
  args: {
    pool: {
      ...meta.args.pool,
      provider: 'xiaomi-token-plan-ams',
      label: 'Monthly token allowance',
      seats: 12,
    },
  },
};
