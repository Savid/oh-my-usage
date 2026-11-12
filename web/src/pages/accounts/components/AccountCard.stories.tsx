import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { keyFixture, pausedSeatFixture, pauseHandlers, seatFixture, strayFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { AccountCard } from './AccountCard';

const meta = {
  title: 'Pages/Accounts/Components/AccountCard',
  component: AccountCard,
  parameters: { layout: 'padded', msw: { handlers: [pauseHandlers.ok] } },
  args: { account: seatFixture, now: NOW_MS, controls: true, headingLevel: 3 },
  argTypes: { headingLevel: { control: 'inline-radio', options: [2, 3] } },
  decorators: [
    Story => (
      <div className="max-w-page">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountCard>;

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
    await expect(canvas.getByText('blocked for 2 h')).toHaveAttribute('data-tone', 'danger');
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
    await expect(canvas.getByText('pro plan')).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const NoUsage: Story = {
  args: { account: keyFixture },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No usage is reported for this account.')).toBeInTheDocument();
  },
};

export const LongIdentifiers: Story = {
  args: {
    account: {
      ...seatFixture,
      email: 'a.very.long.mailbox.name.that.keeps.going@a-long-subdomain.an-even-longer-domain.example.com',
      orgName: 'An Organisation With A Name Long Enough To Wrap Onto A Second Line Of The Card',
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
