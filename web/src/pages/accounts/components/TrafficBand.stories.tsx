import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { quietTrafficFixture, staleTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { TrafficBand } from './TrafficBand';

const meta = {
  title: 'Pages/Accounts/Components/TrafficBand',
  component: TrafficBand,
  parameters: { layout: 'padded' },
  args: { traffic: trafficFixture, now: NOW_MS },
} satisfies Meta<typeof TrafficBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Traffic' })).toHaveTextContent('$249');
    await expect(canvas.getByRole('img', { name: 'Cost at API prices by minute, last hour' })).toBeInTheDocument();
  },
};

export const Quiet: Story = {
  args: { traffic: quietTrafficFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No traffic in this period.')).toBeInTheDocument();
  },
};

export const BrokerUnreachable: Story = {
  args: { traffic: staleTrafficFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('last read 12m ago');
  },
};
