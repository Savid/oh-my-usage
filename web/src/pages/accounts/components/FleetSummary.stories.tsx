import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { at, NOW_MS } from '@/test-utils/time';
import { FleetSummary } from './FleetSummary';

const meta = {
  title: 'Pages/Accounts/Components/FleetSummary',
  component: FleetSummary,
  parameters: { layout: 'padded' },
  args: {
    fleet: {
      accounts: 10,
      burning: 6,
      idle: 4,
      paused: 1,
      dry: 2,
      spent: 1,
      monthlyUsd: 780,
      priced: 10,
      resetsUsable: 3,
    },
    updatedAt: at(-45_000),
    now: NOW_MS,
  },
} satisfies Meta<typeof FleetSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Fleet' })).toHaveTextContent('$780/mo');
  },
};

export const Calm: Story = {
  args: {
    fleet: { accounts: 4, burning: 1, idle: 3, paused: 0, dry: 0, spent: 0, priced: 0, resetsUsable: 0 },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('running dry')).not.toBeInTheDocument();
  },
};

export const NotReadYet: Story = {
  args: {
    fleet: { accounts: 0, burning: 0, idle: 0, paused: 0, dry: 0, spent: 0, priced: 0, resetsUsable: 0 },
    updatedAt: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('gateway not read yet')).toBeVisible();
  },
};
