import type { Meta, StoryObj } from '@storybook/react-vite';
import { TokenTable } from './blocks/TokenTable';
import { TypeScale } from './blocks/TypeScale';

const meta = {
  title: 'Foundations/Typography',
  tags: ['!autodocs', '!dev'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Families: Story = {
  render: () => (
    <TokenTable namespace="font" usage={name => `font-${name}`} notes={{ mono: 'everything; set on body' }} />
  ),
};

export const Scale: Story = {
  render: () => <TypeScale sample="The quick brown fox jumps over the lazy dog" />,
};

export const Sizes: Story = {
  render: () => (
    <TokenTable
      namespace="text"
      usage={name => `text-${name}`}
      notes={{
        micro: 'small capitals: cell labels, badges, section names',
        caption: 'secondary lines and notes',
        body: 'running text and controls (the page default)',
        title: 'the page heading, and the figure in a cell',
        heading: "error and not-found pages, and a total's figure",
        display: "the figure an account's row leads with",
      }}
    />
  ),
};

export const Weights: Story = {
  render: () => (
    <TokenTable
      namespace="font-weight"
      usage={name => `font-${name}`}
      notes={{ medium: 'names in a row', semibold: 'headings and figures' }}
    />
  ),
};

export const Tracking: Story = {
  render: () => (
    <TokenTable
      namespace="tracking"
      usage={name => `tracking-${name}`}
      notes={{ caps: 'with uppercase, on text-micro labels' }}
    />
  ),
};
