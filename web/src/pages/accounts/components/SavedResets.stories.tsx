import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { seatFixture, strayFixture } from '@/test-utils/handlers';
import { NOW_MS } from '@/test-utils/time';
import { SavedResets } from './SavedResets';

const meta = {
  title: 'Pages/Accounts/Components/SavedResets',
  component: SavedResets,
  parameters: { layout: 'padded' },
  args: { resets: seatFixture.resets, limits: seatFixture.limits, now: NOW_MS },
  decorators: [
    Story => (
      <div className="flex max-w-narrow">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SavedResets>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Saved resets' })).toHaveTextContent('2 held, 1 usable now');
    await expect(canvas.getByText('usable now')).toBeInTheDocument();
  },
};

export const Undescribed: Story = {
  args: { resets: strayFixture.resets, limits: strayFixture.limits },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('A limit reset')).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { resets: undefined, limits: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('This account holds no saved resets.')).toBeInTheDocument();
  },
};
