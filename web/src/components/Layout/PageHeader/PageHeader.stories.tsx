import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AppShell } from '@/components/Layout/AppShell';
import { PageHeader } from './PageHeader';

const meta = {
  title: 'Components/Layout/PageHeader',
  component: PageHeader,
  parameters: { layout: 'fullscreen' },
  args: { children: <span className="text-caption text-muted">12 accounts · 6 burning · 5 idle</span> },
  decorators: [
    (Story, { parameters }) => (
      <AppShell name="oh-my-usage" connection={parameters.connection === 'reconnecting' ? 'reconnecting' : 'live'}>
        <Story />
      </AppShell>
    ),
  ],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'oh-my-usage' })).toHaveAttribute('href', '/');
    // A stream that is up is not remarked on.
    await expect(canvas.queryByText('reconnecting')).not.toBeInTheDocument();
  },
};

/** Where a page sits, as the Traffic page and an account's page say it. */
export const Trail: Story = {
  args: {
    children: (
      <span className="text-body">
        <span className="text-muted">Accounts /</span> Traffic
      </span>
    ),
  },
};

export const Reconnecting: Story = {
  parameters: { connection: 'reconnecting' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('reconnecting')).toHaveAttribute('data-tone', 'warn');
  },
};
