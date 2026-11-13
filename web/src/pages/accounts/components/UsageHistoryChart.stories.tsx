import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { UsageSample } from '@/api';
import { historyFixture } from '@/test-utils/handlers';
import { at } from '@/test-utils/time';
import { UsageHistoryChart } from './UsageHistoryChart';

const HOUR = 3_600_000;

function climb(limitId: string, label: string, from: number, perStep: number): UsageSample[] {
  return Array.from({ length: 13 }, (_, step) => ({
    at: at((step - 12) * 2 * HOUR),
    limitId,
    label,
    usedFraction: Math.round((from + step * perStep) * 100) / 100,
  }));
}

const meta = {
  title: 'Pages/Accounts/Components/UsageHistoryChart',
  component: UsageHistoryChart,
  parameters: { layout: 'padded' },
  args: { samples: historyFixture.samples },
  decorators: [
    Story => (
      <div className="max-w-page rounded-md border border-border bg-surface p-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UsageHistoryChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Share left of each limit over time' })).toBeInTheDocument();
    // The readout above the plot; the table repeats the values.
    await expect(within(canvas.getByRole('list')).getByText('24%')).toBeInTheDocument();
  },
};

export const ThreeLimits: Story = {
  args: {
    samples: [
      ...climb('5h', 'Claude 5 Hour', 0.05, 0.03),
      ...climb('7d', 'Claude 7 Day', 0.4, 0.02),
      ...climb('7d:fable', 'Claude 7 Day (Fable)', 0.1, 0.06),
    ],
  },
  play: async ({ canvas }) => {
    const legend = within(canvas.getByRole('list'));
    await expect(legend.getByText('Claude 5 Hour')).toBeInTheDocument();
    await expect(legend.getByText('Claude 7 Day (Fable)')).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { samples: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No usage has been recorded in this period yet.')).toBeInTheDocument();
  },
};

export const SingleSample: Story = {
  args: { samples: [{ at: at(0), limitId: '7d', label: 'Claude 7 Day', usedFraction: 0.4 }] },
  play: async ({ canvas }) => {
    await expect(within(canvas.getByRole('list')).getByText('60%')).toBeInTheDocument();
  },
};

export const Spent: Story = {
  args: { samples: climb('credits', 'Monthly credits', 0.7, 0.05) },
  play: async ({ canvas }) => {
    // The last samples run over the limit: nothing left, never less.
    await expect(within(canvas.getByRole('list')).getByText('0%')).toBeInTheDocument();
  },
};

export const MoreLimitsThanColours: Story = {
  args: {
    samples: ['One', 'Two', 'Three', 'Four'].flatMap((label, index) =>
      climb(label, `Limit ${label}`, index / 10, 0.02)
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Showing the first 3 of 4 limits.')).toBeInTheDocument();
  },
};

export const HoverInteraction: Story = {
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByTestId('plot'));
    await expect(await canvas.findByText(/^At /)).toBeInTheDocument();
    await expect(canvas.getByTestId('crosshair')).toBeInTheDocument();
  },
};

export const TableInteraction: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText('Show as a table'));
    await expect(canvas.getByRole('table')).toBeVisible();
    await expect(canvas.getAllByRole('row')).toHaveLength(30);
  },
};
