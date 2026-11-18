import { useEffect, useState, type JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { RollingNumber } from './RollingNumber';

const meta = {
  title: 'Components/Data/RollingNumber',
  component: RollingNumber,
  parameters: { layout: 'padded' },
  args: { value: '1,284', className: 'text-display font-semibold' },
} satisfies Meta<typeof RollingNumber>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('1,284')).toBeInTheDocument();
  },
};

/** Money keeps its sign and point still while the digits turn. */
export const Price: Story = {
  args: { value: '$54.57', className: 'text-heading font-semibold' },
};

const TICKS = ['296', '301', '287', '1,040', '998', '312'];

function TickingFigure(): JSX.Element {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(value => (value + 1) % TICKS.length), 1500);
    return () => clearInterval(timer);
  }, []);

  return <RollingNumber value={TICKS[tick] ?? '0'} className="text-display font-semibold" />;
}

/** A new figure every second and a half, as a live reading brings them. */
export const Ticking: Story = {
  render: () => <TickingFigure />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('296')).toBeInTheDocument();
  },
};
