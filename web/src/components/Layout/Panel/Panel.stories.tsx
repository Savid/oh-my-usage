import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Panel } from './Panel';

const meta = {
  title: 'Components/Layout/Panel',
  component: Panel,
  parameters: { layout: 'padded' },
  args: {
    title: 'Clients',
    count: 3,
    aside: 'last 7 days',
    hairline: 'quiet',
    children: <p className="px-4 py-3 text-caption text-muted">What the panel holds.</p>,
  },
  argTypes: { hairline: { control: 'inline-radio', options: ['quiet', 'strong'] } },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Clients' })).toHaveTextContent('Clients3last 7 days');
  },
};

/** The band a page opens on: a stronger hairline and no head of its own. */
export const Band: Story = {
  args: { title: undefined, count: undefined, aside: undefined, hairline: 'strong' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
  },
};

export const LongTitle: Story = {
  args: {
    title: 'A heading long enough to meet the words at the end',
    aside: 'and words long enough to wrap onto a line of their own',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2 })).toBeInTheDocument();
  },
};
