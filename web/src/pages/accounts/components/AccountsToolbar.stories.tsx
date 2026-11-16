import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { AccountsToolbar } from './AccountsToolbar';

const meta = {
  title: 'Pages/Accounts/Components/AccountsToolbar',
  component: AccountsToolbar,
  parameters: { layout: 'padded' },
  args: { count: 7, order: 'risk', onOrder: fn() },
  argTypes: { order: { control: 'inline-radio', options: ['risk', 'used', 'listed'] } },
} satisfies Meta<typeof AccountsToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Risk' })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const OrderInteraction: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Used' }));
    await expect(args.onOrder).toHaveBeenCalledWith('used');
  },
};
