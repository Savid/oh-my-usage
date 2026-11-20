import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AppShell } from '@/components/Layout/AppShell';
import { PageHeader } from './PageHeader';

const meta = {
  title: 'Components/Layout/PageHeader',
  component: PageHeader,
  parameters: { layout: 'fullscreen' },
  args: { title: 'Traffic' },
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
    await expect(canvas.getByRole('heading', { level: 1, name: 'Traffic' })).toBeInTheDocument();
    // A stream that is up is not remarked on.
    await expect(canvas.queryByText('reconnecting')).not.toBeInTheDocument();
  },
};

export const Reconnecting: Story = {
  parameters: { connection: 'reconnecting' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('reconnecting')).toHaveAttribute('data-tone', 'warn');
  },
};
