import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AppShell } from './AppShell';

const meta = {
  title: 'Components/Layout/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  args: {
    name: 'oh-my-usage',
    traffic: true,
    connection: 'live',
    children: <p className="text-body text-muted">Page content</p>,
  },
  argTypes: { connection: { control: 'inline-radio', options: ['connecting', 'live', 'reconnecting'] } },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'oh-my-usage' })).toHaveAttribute('href', '/');
    await expect(canvas.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/');
    await expect(canvas.getByRole('link', { name: 'Traffic' })).toHaveAttribute('href', '/traffic');
    // A stream that is up is not remarked on.
    await expect(canvas.queryByText('live')).not.toBeInTheDocument();
  },
};

export const WithoutBroker: Story = {
  args: { traffic: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Accounts' })).toBeInTheDocument();
    await expect(canvas.queryByRole('link', { name: 'Traffic' })).not.toBeInTheDocument();
  },
};

export const Reconnecting: Story = {
  args: { connection: 'reconnecting' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('reconnecting')).toHaveAttribute('data-tone', 'warn');
  },
};
