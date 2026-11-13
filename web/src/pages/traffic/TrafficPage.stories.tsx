import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { AppShell } from '@/components/Layout/AppShell';
import { configHandlers, showcaseHandlers, trafficHandlers } from '@/test-utils/handlers';
import { TrafficPage } from './TrafficPage';

const meta = {
  title: 'Pages/Traffic/TrafficPage',
  component: TrafficPage,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen', msw: { handlers: [configHandlers.ok, trafficHandlers.ok] } },
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
} satisfies Meta<typeof TrafficPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const totals = await canvas.findByRole('region', { name: 'Totals' });
    await expect(within(totals).getByRole('article', { name: 'Last hour' })).toHaveTextContent('$249');
    await expect(canvas.getByRole('table')).toBeInTheDocument();
  },
};

/**
 * The page in full use, under the top bar: a week of traffic through the
 * gateway to Anthropic, OpenAI Codex, xAI, OpenCode Go and OpenRouter,
 * following the working day. Times count from when it opens.
 */
export const Showcase: Story = {
  parameters: { shell: true, path: '/traffic', msw: { handlers: showcaseHandlers } },
  render: () => (
    <AppShell name="oh-my-usage" traffic connection="live">
      <TrafficPage />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    const totals = await canvas.findByRole('region', { name: 'Totals' });
    await expect(within(totals).getByRole('article', { name: '7 days' })).toHaveTextContent('xAI Grok');
    await expect(canvas.getByRole('table')).toBeInTheDocument();
    // The router stands on this page, so its tab is the current one.
    await expect(within(canvas.getByRole('navigation')).getByRole('link', { name: 'Traffic' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  },
};

export const Loading: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, trafficHandlers.pending] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Loading the traffic…');
  },
};

export const Empty: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, trafficHandlers.quiet] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('No client has sent anything in the last 7 days.')).toBeInTheDocument();
  },
};

export const Unreachable: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, trafficHandlers.down] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Could not reach oh-my-usage.');
  },
};

export const BrokerUnreachable: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, trafficHandlers.stale] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('The broker is not answering');
  },
};

export const WithoutBroker: Story = {
  parameters: { msw: { handlers: [configHandlers.readOnly, trafficHandlers.unavailable] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/none is configured/)).toBeInTheDocument();
  },
};
