import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { KNOWN_PROVIDERS, providerName } from '@/lib/accounts';
import { ProviderIcon } from './ProviderIcon';

// Every provider omp knows, then one it does not.
const PROVIDERS = [...KNOWN_PROVIDERS, 'some-new-provider'];

const meta = {
  title: 'Components/Data/ProviderIcon',
  component: ProviderIcon,
  args: { provider: 'anthropic', decorative: false, size: 'md' },
  argTypes: {
    provider: { control: 'select', options: PROVIDERS },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
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
    <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-caption text-muted sm:grid-cols-3 lg:grid-cols-4">
      {PROVIDERS.map(provider => (
        <li key={provider} className="flex items-center gap-2">
          <ProviderIcon provider={provider} size="md" decorative />
          {providerName(provider)}
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('svg')).toHaveLength(PROVIDERS.length);
    await expect(canvasElement.querySelectorAll('[data-mark="logo"]')).toHaveLength(82);
  },
};
