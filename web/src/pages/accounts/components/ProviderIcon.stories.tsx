import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ProviderIcon } from './ProviderIcon';

const PROVIDERS = [
  'anthropic',
  'openai-codex',
  'opencode-go',
  'openrouter',
  'google-gemini-cli',
  'kimi-code',
  'xai-oauth',
  'devin',
  'some-new-provider',
];

const meta = {
  title: 'Pages/Accounts/Components/ProviderIcon',
  component: ProviderIcon,
  args: { provider: 'anthropic', decorative: false },
  argTypes: { provider: { control: 'select', options: PROVIDERS } },
} satisfies Meta<typeof ProviderIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Anthropic' })).toHaveAttribute('data-mark', 'logo');
  },
};

export const Unknown: Story = {
  args: { provider: 'some-new-provider' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'some-new-provider' })).toHaveAttribute('data-mark', 'initial');
  },
};

export const Every: Story = {
  render: () => (
    <ul className="flex gap-4 text-muted">
      {PROVIDERS.map(provider => (
        <li key={provider}>
          <ProviderIcon provider={provider} />
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('img')).toHaveLength(PROVIDERS.length);
  },
};
