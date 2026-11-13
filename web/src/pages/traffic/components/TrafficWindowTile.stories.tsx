import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { quietTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { TrafficWindowTile } from './TrafficWindowTile';

const meta = {
  title: 'Pages/Traffic/Components/TrafficWindowTile',
  component: TrafficWindowTile,
  args: { window: trafficFixture.windows[1]! },
  decorators: [
    Story => (
      <div className="flex w-104">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrafficWindowTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article', { name: '24 hours' })).toHaveTextContent('$1,068');
    await expect(canvas.getByText('OpenCode Go')).toBeInTheDocument();
  },
};

export const LastHour: Story = {
  args: { window: trafficFixture.windows[0]! },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article', { name: 'Last hour' })).toHaveTextContent('$249');
  },
};

export const Empty: Story = {
  args: { window: quietTrafficFixture.windows[0]! },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nothing passed.')).toBeInTheDocument();
  },
};
