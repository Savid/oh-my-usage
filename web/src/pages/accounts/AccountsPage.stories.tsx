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
import { freezeClock } from '@/test-utils/time';
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
    // The page as the app frames it; a story that draws the frame brings its own.
    (Story, { parameters }) =>
      parameters.shell === true ? (
        <Story />
      ) : (
        <div className="p-2 sm:p-3">
          <Story />
        </div>
      ),
  ],
  // The fixtures are built against NOW_MS, so the page reads its clock there; a
  // showcase builds its own against the real clock and says so.
  beforeEach: ({ parameters }) => (parameters.liveClock === true ? undefined : freezeClock()),
} satisfies Meta<typeof AccountsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const totals = await canvas.findByRole('list', { name: 'Totals' });
    await expect(within(totals).getByRole('listitem', { name: 'Anthropic 7 Day' })).toBeInTheDocument();
    await expect(await canvas.findByRole('region', { name: 'Traffic' })).toBeInTheDocument();
    await expect(await canvas.findByRole('switch', { name: 'Take traffic', checked: false })).toBeInTheDocument();
  },
};

/**
 * The homepage in full use, in the app's frame: three Claude seats (one busy,
 * one paused with its 5-hour window spent, one idle), a Codex seat, SuperGrok, OpenCode
 * Go and an OpenRouter key, a week of history through each window's resets,
 * and a week of traffic through the gateway. Times count from when it opens.
 */
export const Showcase: Story = {
  parameters: { shell: true, liveClock: true, msw: { handlers: showcaseHandlers } },
  render: () => (
    <AppShell name="oh-my-usage" connection="live">
      <AccountsPage />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    const every = await canvas.findByRole('region', { name: 'Every account' });
    await expect(within(every).getAllByRole('article')).toHaveLength(7);
    await expect(await canvas.findByRole('switch', { name: 'Take traffic', checked: false })).toBeInTheDocument();
    // No bar of pages: the traffic leads to its own page, with what it shows.
    await expect(canvas.queryByRole('navigation')).not.toBeInTheDocument();
    await expect(await canvas.findByRole('link', { name: 'Traffic' })).toHaveAttribute(
      'href',
      '/traffic?metric=output'
    );
  },
};

export const WithoutControls: Story = {
  parameters: {
    msw: { handlers: [configHandlers.readOnly, accountsHandlers.ok, trendsHandlers.ok, trafficHandlers.unavailable] },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('region', { name: 'Every account' })).toBeInTheDocument();
    // The order of the list can still be changed; nothing can be paused.
    await expect(canvas.queryByRole('switch')).not.toBeInTheDocument();
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
  play: async ({ canvas }) => {
    const every = await canvas.findByRole('region', { name: 'Every account' });
    // The rows fall back to levels; the traffic's own charts are unaffected.
    await expect(every.querySelector('[data-chart="history"]')).not.toBeInTheDocument();
  },
};
