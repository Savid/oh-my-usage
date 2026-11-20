import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AppShell } from '@/components/Layout/AppShell';
import { PageHeader } from './PageHeader';

const meta = {
  title: 'Components/Layout/PageHeader',
  component: PageHeader,
  parameters: { layout: 'fullscreen' },
  args: {
    children: (
      <span className="text-body">
        <span className="text-muted">Accounts /</span> Traffic
      </span>
    ),
  },
  argTypes: { named: { control: 'boolean' } },
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

/** The homepage's band heading: the name written beside the mark. */
export const Named: Story = {
  args: { named: true, children: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'oh-my-usage' })).toHaveTextContent('oh-my-usage');
  },
};

export const Reconnecting: Story = {
  parameters: { connection: 'reconnecting' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('reconnecting')).toHaveAttribute('data-tone', 'warn');
  },
};
