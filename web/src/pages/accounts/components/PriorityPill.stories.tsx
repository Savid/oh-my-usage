import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PriorityPill } from './PriorityPill';

const meta = {
  title: 'Pages/Accounts/Components/PriorityPill',
  component: PriorityPill,
  parameters: { layout: 'padded' },
  args: { priority: { standing: 'ranked', rank: 1, reason: 'reset lapses in 1d', position: 0 }, reason: 'always' },
  argTypes: { reason: { control: 'inline-radio', options: ['always', 'wide', 'never'] } },
} satisfies Meta<typeof PriorityPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('priority')).toHaveTextContent('1st · reset lapses in 1d');
  },
};

export const HeldBack: Story = {
  args: { priority: { standing: 'later', reason: '5h nearly full', position: 3 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('priority')).toHaveAttribute('data-standing', 'later');
  },
};

export const Last: Story = {
  args: { priority: { standing: 'last', reason: 'spent', position: 5 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId('priority')).toHaveTextContent('last · spent');
  },
};
