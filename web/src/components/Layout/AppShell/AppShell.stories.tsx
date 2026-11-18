import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PageHeader } from '@/components/Layout/PageHeader';
import { AppShell } from './AppShell';

const meta = {
  title: 'Components/Layout/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  args: {
    name: 'oh-my-usage',
    connection: 'live',
    children: (
      <>
        <PageHeader>
          <span className="text-caption text-muted">The page&apos;s first line</span>
        </PageHeader>
        <p className="px-1 text-body text-muted">Page content</p>
      </>
    ),
  },
  argTypes: { connection: { control: 'inline-radio', options: ['connecting', 'live', 'reconnecting'] } },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'oh-my-usage' })).toHaveAttribute('href', '/');
    await expect(canvas.queryByRole('navigation')).not.toBeInTheDocument();
  },
};

export const Reconnecting: Story = {
  args: { connection: 'reconnecting' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('reconnecting')).toHaveAttribute('data-tone', 'warn');
  },
};
