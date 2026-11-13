import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import {
  keyFixture,
  pausedSeatFixture,
  pauseHandlers,
  seatFixture,
  strayFixture,
  trendsFixture,
} from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { AccountRow } from './AccountRow';

const meta = {
  title: 'Pages/Accounts/Components/AccountRow',
  component: AccountRow,
  parameters: { layout: 'padded', msw: { handlers: [pauseHandlers.ok] } },
  args: {
    account: seatFixture,
    trends: trendsFixture.trends,
    start: NOW_MS - 7 * 24 * 3_600_000,
    now: NOW_MS,
    controls: true,
    headingLevel: 3,
  },
  argTypes: { headingLevel: { control: 'inline-radio', options: [2, 3] } },
  decorators: [
    Story => (
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article', { name: 'one@example.com' })).toBeInTheDocument();
    await expect(canvas.getByText('active')).toHaveAttribute('data-tone', 'ok');
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeEnabled();
  },
};

export const Paused: Story = {
  args: { account: pausedSeatFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('paused')).toHaveAttribute('data-tone', 'warn');
    await expect(canvas.getByRole('button', { name: 'Resume' })).toBeEnabled();
  },
};

export const Blocked: Story = {
  args: { account: { ...pausedSeatFixture, paused: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('blocked 2h')).toHaveAttribute('data-tone', 'danger');
  },
};

export const WithoutControls: Story = {
  args: { controls: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const NoBrokerCredential: Story = {
  args: { account: strayFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('pro · 1 reset')).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const NoUsage: Story = {
  args: { account: keyFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article')).toHaveTextContent('no usage reported');
  },
};

export const NearLimit: Story = {
  args: { account: { ...strayFixture, limits: [{ id: 'codex:7d', label: '7 days', usedFraction: 0.9 }] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article')).toHaveAttribute('data-severity', 'warn');
    await expect(canvas.getByText('▲')).toBeVisible();
  },
};

export const Spent: Story = {
  args: { account: { ...strayFixture, limits: [{ id: 'codex:7d', label: '7 days', usedFraction: 1 }] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article')).toHaveAttribute('data-severity', 'danger');
  },
};

export const NothingRecorded: Story = {
  args: { trends: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article')).toHaveAttribute('data-chart', 'level');
  },
};

export const LongIdentifiers: Story = {
  args: {
    account: {
      ...seatFixture,
      email: 'a.very.long.mailbox.name.that.keeps.going@a-long-subdomain.an-even-longer-domain.example.com',
      orgName: 'An Organisation With A Name Long Enough To Run Out Of Room On The Row',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeVisible();
  },
};

export const PausingInteraction: Story = {
  parameters: { msw: { handlers: [pauseHandlers.pending] } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
    await expect(await canvas.findByRole('button', { name: 'Pause' })).toBeDisabled();
  },
};

export const PauseFailedInteraction: Story = {
  parameters: { msw: { handlers: [pauseHandlers.refused] } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Could not pause the account');
  },
};
