import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { quietTrafficFixture, trafficFixture } from '@/test-utils/handlers';
import { TrafficBars } from './TrafficBars';

const meta = {
  title: 'Components/Data/TrafficBars',
  component: TrafficBars,
  parameters: { layout: 'padded' },
  args: { series: trafficFixture.minutes, label: 'Cost at API prices by minute, last hour', size: 'panel' },
  decorators: [
    Story => (
      <div className="rounded-md border border-border bg-surface p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrafficBars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Cost at API prices by minute, last hour' })).toBeInTheDocument();
    await expect(canvas.getByText(/^Latest /)).toBeInTheDocument();
    await expect(within(canvas.getByRole('list')).getByText('OpenAI Codex')).toBeInTheDocument();
  },
};

export const Band: Story = {
  args: { size: 'band' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img')).toBeInTheDocument();
  },
};

export const WeekByHour: Story = {
  args: {
    series: trafficFixture.hours,
    label: 'Cost at API prices by hour, last 7 days',
    measuredSince: trafficFixture.measuredSince,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('measured-from')).toHaveTextContent('measured from here');
    await expect(within(canvas.getByRole('list')).getByText('OpenCode Go')).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { series: quietTrafficFixture.minutes },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No traffic in this period.')).toBeInTheDocument();
  },
};

export const HoverInteraction: Story = {
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByTestId('plot'));
    await expect(await canvas.findByText(/^At /)).toBeInTheDocument();
    await expect(canvas.getByTestId('highlight')).toBeInTheDocument();
  },
};
