import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { accountsFixture, neverReachedFixture, unreachableFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { SourceAlerts } from './SourceAlerts';

const meta = {
  title: 'Pages/Accounts/Components/SourceAlerts',
  component: SourceAlerts,
  parameters: { layout: 'padded' },
  args: { list: unreachableFixture, stale: false, now: NOW_MS },
} satisfies Meta<typeof SourceAlerts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('alert')).toHaveLength(2);
    await expect(canvas.getByText('The gateway cannot be reached')).toBeInTheDocument();
    await expect(canvas.getByText('The broker cannot be reached')).toBeInTheDocument();
  },
};

export const NothingReadYet: Story = {
  args: { list: neverReachedFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No usage has been read yet\./)).toBeInTheDocument();
  },
};

export const DaemonGone: Story = {
  args: { list: accountsFixture, stale: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Lost contact with oh-my-usage')).toBeInTheDocument();
  },
};

export const AllReachable: Story = {
  args: { list: accountsFixture },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
