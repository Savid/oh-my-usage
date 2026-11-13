import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { at, NOW_MS } from '@/test-utils/time';
import { PoolTile } from './PoolTile';

const HOUR = 3_600_000;

const meta = {
  title: 'Pages/Accounts/Components/PoolTile',
  component: PoolTile,
  args: {
    pool: {
      provider: 'anthropic',
      limitId: 'anthropic:7d',
      label: '7 Day',
      seats: 2,
      used: 1.1,
      usedFraction: 0.55,
      severity: 'normal',
      nextReset: at(20 * HOUR),
      staggered: true,
    },
    now: NOW_MS,
  },
  decorators: [
    Story => (
      <div className="flex w-104">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PoolTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article', { name: 'Anthropic 7 Day' })).toHaveTextContent('55%');
    await expect(canvas.getByText('20h')).toBeInTheDocument();
  },
};

export const OneSeat: Story = {
  args: {
    pool: {
      provider: 'openai-codex',
      limitId: 'codex:7d',
      label: '7 days',
      seats: 1,
      used: 0.68,
      usedFraction: 0.68,
      severity: 'normal',
      nextReset: at(110 * HOUR),
      staggered: false,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article')).toHaveTextContent('resets in 4d 14h');
  },
};

export const NearLimit: Story = {
  args: { pool: { ...meta.args.pool, used: 1.84, usedFraction: 0.92, severity: 'warn' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('used, near limit')).toBeInTheDocument();
  },
};

export const Spent: Story = {
  args: { pool: { ...meta.args.pool, used: 2, usedFraction: 1, severity: 'danger' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('used, spent')).toBeInTheDocument();
  },
};

export const NoResetTime: Story = {
  args: { pool: { ...meta.args.pool, nextReset: undefined, staggered: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article')).not.toHaveTextContent('reset');
  },
};

export const UnknownProvider: Story = {
  args: { pool: { ...meta.args.pool, provider: 'some-new-provider', label: 'A window with a long name', seats: 12 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article', { name: 'some-new-provider A window with a long name' })).toBeVisible();
  },
};
