import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { keyFixture, pausedSeatFixture, seatFixture } from '@/test-utils/handlers';
import { at, NOW_MS } from '@/test-utils/time';
import { AccountFacts } from './AccountFacts';

const HOUR = 3_600_000;

const meta = {
  title: 'Pages/Accounts/Components/AccountFacts',
  component: AccountFacts,
  parameters: { layout: 'padded' },
  args: { account: seatFixture, now: NOW_MS },
  decorators: [
    Story => (
      <div className="flex max-w-narrow">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountFacts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('active')).toHaveAttribute('data-tone', 'ok');
    await expect(canvas.getByText('OAuth login')).toBeInTheDocument();
  },
};

export const Paused: Story = {
  args: { account: pausedSeatFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('paused')).toHaveAttribute('data-tone', 'warn');
    await expect(canvas.getByText('anthropic:5h')).toBeInTheDocument();
  },
};

export const Blocked: Story = {
  args: {
    account: {
      ...seatFixture,
      blocks: [
        { scope: '', until: at(3 * HOUR) },
        { scope: 'tier:fable', until: at(HOUR) },
      ],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('blocked')).toHaveAttribute('data-tone', 'danger');
    await expect(canvas.getByText('everything')).toBeInTheDocument();
  },
};

export const ApiKey: Story = {
  args: { account: keyFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('API key')).toBeInTheDocument();
    await expect(canvas.getByText('The provider has reported no usage.')).toBeInTheDocument();
  },
};

export const StaleUsage: Story = {
  args: { account: { ...seatFixture, fetchedAt: at(-2 * HOUR) } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('2h ago: the figures above are that old.')).toBeInTheDocument();
  },
};
