import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { AppShell } from '@/components/Layout/AppShell';
import {
  accountsHandlers,
  configHandlers,
  showcaseHandlers,
  trafficHandlers,
  trendsHandlers,
} from '@/test-utils/handlers';
import { AccountsPage } from './AccountsPage';

const meta = {
  title: 'Pages/Accounts/AccountsPage',
  component: AccountsPage,
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: [configHandlers.ok, accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.ok] },
  },
  decorators: [
    // The page as the app frames it; a story that draws the top bar brings its own frame.
    (Story, { parameters }) =>
      parameters.shell === true ? (
        <Story />
      ) : (
        <div className="p-2 sm:p-3">
          <Story />
        </div>
      ),
  ],
} satisfies Meta<typeof AccountsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const totals = await canvas.findByRole('region', { name: 'Totals' });
    await expect(within(totals).getByRole('article', { name: 'Anthropic 7 Day' })).toBeInTheDocument();
    await expect(await canvas.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
  },
};

/**
 * The homepage in full use, under the top bar: two Claude seats (one busy,
 * one paused with its 5-hour window spent), a Codex seat, SuperGrok, OpenCode
 * Go and an OpenRouter key, a week of history through each window's resets,
 * and a week of traffic through the gateway. Times count from when it opens.
 */
export const Showcase: Story = {
  parameters: { shell: true, msw: { handlers: showcaseHandlers } },
  render: () => (
    <AppShell name="oh-my-usage" traffic connection="live">
      <AccountsPage />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    const every = await canvas.findByRole('region', { name: 'Every account' });
    await expect(within(every).getAllByRole('article')).toHaveLength(6);
    await expect(await canvas.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
    await expect(within(canvas.getByRole('navigation')).getByRole('link', { name: 'Traffic' })).toBeInTheDocument();
  },
};

export const WithoutControls: Story = {
  parameters: {
    msw: { handlers: [configHandlers.readOnly, accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.unavailable] },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('region', { name: 'Every account' })).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: {
    msw: { handlers: [configHandlers.ok, accountsHandlers.pending, trendsHandlers.ok, trafficHandlers.ok] },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Loading the accounts…');
  },
};

export const Empty: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.empty, trendsHandlers.ok, trafficHandlers.ok] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('The gateway reports no accounts.')).toBeInTheDocument();
  },
};

export const Unreachable: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.down, trendsHandlers.ok, trafficHandlers.ok] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Could not reach oh-my-usage.');
  },
};

export const GatewayUnreachable: Story = {
  parameters: {
    msw: { handlers: [configHandlers.ok, accountsHandlers.unreachable, trendsHandlers.ok, trafficHandlers.ok] },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('The gateway cannot be reached');
    await expect(within(canvas.getByRole('region', { name: 'Every account' })).getAllByRole('article')).toHaveLength(4);
  },
};

export const NoHistory: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.ok, trendsHandlers.empty, trafficHandlers.ok] } },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByRole('region', { name: 'Every account' })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-chart="history"]')).not.toBeInTheDocument();
  },
};
