import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { trafficFixture } from '@/test-utils/handlers';
import { TrafficClients } from './TrafficClients';

const meta = {
  title: 'Pages/Traffic/Components/TrafficClients',
  component: TrafficClients,
  parameters: { layout: 'padded' },
  args: { clients: trafficFixture.clients },
  decorators: [
    Story => (
      <div className="rounded-md border border-border bg-surface p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrafficClients>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('table')).toBeInTheDocument();
    await expect(canvas.getByRole('rowheader', { name: 'laptop' })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { clients: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No client has sent anything in the last 7 days.')).toBeInTheDocument();
  },
};
