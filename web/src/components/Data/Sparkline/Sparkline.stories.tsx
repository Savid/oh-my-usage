import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Sparkline } from './Sparkline';

// A week that climbs, resets and climbs again.
const WEEK = [0.1, 0.18, 0.31, 0.44, 0.52, 0.6, 0.02, 0.08, 0.2, 0.33, 0.41, 0.48].map((value, index) => ({
  time: index,
  value,
}));

const meta = {
  title: 'Components/Data/Sparkline',
  component: Sparkline,
  parameters: { layout: 'padded' },
  args: {
    points: WEEK,
    start: 0,
    end: WEEK.length - 1,
    line: 'stroke-anthropic',
    glow: 'text-anthropic-track',
    wash: 'track',
    head: true,
    className: 'h-16 w-64',
  },
  argTypes: { wash: { control: 'inline-radio', options: ['track', 'tint'] } },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'history');
  },
};

/** A full-strength series colour, as the traffic pulse draws it. */
export const Tint: Story = {
  args: { line: 'stroke-series-2', glow: 'text-series-2', wash: 'tint' },
};

export const Level: Story = {
  args: { points: [], level: 0.35 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'level');
  },
};

export const Empty: Story = {
  args: { points: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-chart]')).toHaveAttribute('data-chart', 'none');
  },
};
