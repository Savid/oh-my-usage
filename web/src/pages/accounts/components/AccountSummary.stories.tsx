import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { historyFixture, pauseHandlers, pausedSeatFixture, seatFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { AccountSummary } from './AccountSummary';

const meta = {
  title: 'Pages/Accounts/Components/AccountSummary',
  component: AccountSummary,
  parameters: { layout: 'padded', msw: { handlers: [pauseHandlers.ok] } },
  args: {
    account: seatFixture,
    priority: { standing: 'ranked', rank: 1, reason: '24% left', position: 0 },
    controls: true,
    samples: historyFixture.samples,
    now: NOW_MS,
  },
  decorators: [
    Story => (
      <div className="w-120 max-w-full rounded-md border border-border bg-surface px-4 py-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'one@example.com' })).toBeInTheDocument();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
  },
};

export const Paused: Story = {
  args: { account: pausedSeatFixture, priority: { standing: 'last', reason: 'paused', position: 1 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('paused')).toHaveAttribute('data-tone', 'warn');
  },
};

export const NoBroker: Story = {
  args: { controls: false, priority: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const LongName: Story = {
  args: { account: { ...seatFixture, email: 'a-very-long-account-name-that-does-not-fit@example-organisation.com' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveClass('truncate');
  },
};

export const PauseRefused: Story = {
  parameters: { msw: { handlers: [pauseHandlers.refused] } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Could not pause the account');
  },
};
