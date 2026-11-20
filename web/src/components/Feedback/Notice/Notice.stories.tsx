import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Notice } from './Notice';

const meta = {
  title: 'Components/Feedback/Notice',
  component: Notice,
  parameters: { layout: 'padded' },
  args: {
    tone: 'warn',
    title: 'Lost contact with oh-my-usage',
    children: 'Showing the last data it sent.',
  },
  argTypes: { tone: { control: 'inline-radio', options: ['warn', 'danger'] } },
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveAttribute('data-tone', 'warn');
  },
};

export const Danger: Story = {
  args: { tone: 'danger', title: 'Could not reach oh-my-usage', children: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveAttribute('data-tone', 'danger');
  },
};

export const LongDetail: Story = {
  args: {
    title: 'The gateway cannot be reached',
    children:
      'GET /v1/usage: dial tcp 172.29.0.3:4019: connect: connection refused. Usage was last read 20 min ago, and every row shows that reading.',
  },
};
