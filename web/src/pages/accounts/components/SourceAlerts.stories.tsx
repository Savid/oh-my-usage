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
    await expect(canvas.getByRole('alert')).toHaveTextContent('The gateway cannot be reached');
    await expect(canvas.getByRole('alert')).toHaveTextContent('The broker cannot be reached');
  },
};

export const NothingReadYet: Story = {
  args: { list: neverReachedFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('No usage has been read yet.');
  },
};

export const DaemonGone: Story = {
  args: { list: accountsFixture, stale: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Lost contact with oh-my-usage.');
  },
};

export const AllReachable: Story = {
  args: { list: accountsFixture },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
