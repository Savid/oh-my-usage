import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import {
  accountsHandlers,
  configHandlers,
  historyHandlers,
  pausedSeatFixture,
  seatFixture,
} from '@/test-utils/handlers';
import { AccountPage } from './AccountPage';

const meta = {
  title: 'Pages/Accounts/AccountPage',
  component: AccountPage,
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: [configHandlers.ok, accountsHandlers.ok, historyHandlers.ok] },
  },
  args: { accountId: seatFixture.id },
} satisfies Meta<typeof AccountPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { level: 2, name: 'one@example.com' })).toBeInTheDocument();
    await expect(await canvas.findByRole('img', { name: 'Used share of each limit over time' })).toBeInTheDocument();
  },
};

export const Paused: Story = {
  args: { accountId: pausedSeatFixture.id },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.pending, historyHandlers.pending] } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(2);
  },
};

export const NoHistory: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.ok, historyHandlers.empty] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('No usage has been recorded in this period yet.')).toBeInTheDocument();
  },
};

export const Unreachable: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.down, historyHandlers.down] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Could not reach oh-my-usage.')).toBeInTheDocument();
    await expect(await canvas.findByText('Could not load the usage history.')).toBeInTheDocument();
  },
};

export const UnknownAccount: Story = {
  args: { accountId: '00000000000000ff' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('The gateway no longer reports this account.')).toBeInTheDocument();
  },
};

export const PeriodInteraction: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '30 days' }));
    await expect(canvas.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'false');
  },
};
