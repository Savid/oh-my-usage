import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { quietTrafficFixture, staleTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { Pulse } from './Pulse';

const meta = {
  title: 'Pages/Accounts/Components/Pulse',
  component: Pulse,
  parameters: { layout: 'padded' },
  args: { traffic: trafficFixture, monthlyUsd: 780, now: NOW_MS },
} satisfies Meta<typeof Pulse>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Traffic' })).toHaveTextContent('9.9×');
  },
};

/** No account has a price, so the third instrument reads the cache. */
export const Unpriced: Story = {
  args: { monthlyUsd: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('of input read from a cache')).toBeVisible();
  },
};

export const Quiet: Story = {
  args: { traffic: quietTrafficFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Traffic' })).toHaveTextContent('$0last hour');
  },
};

export const BrokerUnreachable: Story = {
  args: { traffic: staleTrafficFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('last read 12m ago');
  },
};
