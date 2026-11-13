import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Logo } from './Logo';

const meta = {
  title: 'Components/Brand/Logo',
  component: Logo,
  args: { animated: true },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    // It moves unless the viewer asked for less motion, as the browser the stories are tested in does.
    const moving = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await expect(canvasElement.querySelector('svg')).toHaveAttribute('data-moving', String(moving));
    await expect(canvasElement.querySelectorAll('animate')).toHaveLength(moving ? 4 : 0);
    await expect(canvasElement.querySelectorAll('ellipse')).toHaveLength(2);
  },
};

export const Still: Story = {
  args: { animated: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toHaveAttribute('data-moving', 'false');
    await expect(canvasElement.querySelectorAll('animate')).toHaveLength(0);
  },
};
