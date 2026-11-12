import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { accountsHandlers, configHandlers } from '@/test-utils/handlers';
import { AccountsPage } from './AccountsPage';

const meta = {
  title: 'Pages/Accounts/AccountsPage',
  component: AccountsPage,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen', msw: { handlers: [configHandlers.ok, accountsHandlers.ok] } },
} satisfies Meta<typeof AccountsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('region', { name: 'Anthropic' })).toBeInTheDocument();
    await expect(await canvas.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
  },
};

export const WithoutControls: Story = {
  parameters: { msw: { handlers: [configHandlers.readOnly, accountsHandlers.ok] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('region', { name: 'Anthropic' })).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.pending] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Loading the accounts…');
  },
};

export const Empty: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.empty] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('The gateway reports no accounts.')).toBeInTheDocument();
  },
};

export const Unreachable: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.down] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Could not reach oh-my-usage.');
  },
};

export const GatewayUnreachable: Story = {
  parameters: { msw: { handlers: [configHandlers.ok, accountsHandlers.unreachable] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('The gateway cannot be reached');
    await expect(canvas.getAllByRole('article')).toHaveLength(4);
  },
};
