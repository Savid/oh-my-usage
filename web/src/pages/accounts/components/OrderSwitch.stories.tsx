import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { OrderSwitch } from './OrderSwitch';

const meta = {
  title: 'Pages/Accounts/Components/OrderSwitch',
  component: OrderSwitch,
  parameters: { layout: 'padded' },
  args: { order: 'priority', onOrder: fn() },
  argTypes: { order: { control: 'inline-radio', options: ['priority', 'used', 'listed'] } },
} satisfies Meta<typeof OrderSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Priority' })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const OrderInteraction: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Used' }));
    await expect(args.onOrder).toHaveBeenCalledWith('used');
  },
};
