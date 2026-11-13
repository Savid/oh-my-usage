import type { Meta, StoryObj } from '@storybook/react-vite';
import { TokenTable } from './blocks/TokenTable';

const meta = {
  title: 'Foundations/Layout',
  tags: ['!autodocs', '!dev'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Widths: Story = {
  render: () => (
    <TokenTable
      namespace="container"
      usage={name => `max-w-${name}`}
      notes={{ narrow: 'error and not-found pages', page: 'a column of prose', wide: 'the accounts pages' }}
    />
  ),
};

export const Breakpoints: Story = {
  render: () => (
    <TokenTable
      namespace="breakpoint"
      usage={name => `${name}:`}
      notes={{ sm: 'wider gutters; three cells to a line', lg: "a row's cells sit beside its name" }}
    />
  ),
};

export const Radii: Story = {
  render: () => (
    <TokenTable
      namespace="radius"
      usage={name => `rounded-${name}`}
      notes={{ sm: 'buttons and cells', md: 'panels' }}
    />
  ),
};
