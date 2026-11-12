import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ACCENT_COLORS,
  BORDER_COLORS,
  CONTRAST_EXEMPT,
  CONTRAST_RULES,
  DATA_COLORS,
  STATUS_COLORS,
  SURFACE_COLORS,
  TEXT_COLORS,
} from '@/styles/tokens';
import { ColorSwatches } from './blocks/ColorSwatches';
import { ContrastTable } from './blocks/ContrastTable';
import { Table } from './blocks/Table';

const meta = {
  title: 'Foundations/Colours',
  tags: ['!autodocs', '!dev'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Surfaces: Story = {
  render: () => (
    <ColorSwatches
      tokens={SURFACE_COLORS}
      notes={{ background: 'bg-background: the page', surface: 'bg-surface: cards, panels, the header' }}
    />
  ),
};

export const Lines: Story = {
  render: () => (
    <ColorSwatches
      tokens={BORDER_COLORS}
      notes={{ border: 'border-border: separators', 'border-strong': 'border-border-strong: control outlines' }}
    />
  ),
};

export const Text: Story = {
  render: () => (
    <ColorSwatches
      tokens={TEXT_COLORS}
      notes={{ foreground: 'text-foreground: content', muted: 'text-muted: labels, hints, secondary text' }}
    />
  ),
};

export const Accent: Story = {
  render: () => (
    <ColorSwatches
      tokens={ACCENT_COLORS}
      notes={{
        accent: 'text-accent: links and the product name; the selection',
        'accent-foreground': 'text-accent-foreground: text on bg-accent',
        focus: 'outline-focus: the focus ring',
      }}
    />
  ),
};

export const Status: Story = {
  render: () => (
    <ColorSwatches
      tokens={STATUS_COLORS}
      notes={{
        ok: 'text-ok: healthy, done',
        warn: 'text-warn: degraded, needs attention',
        danger: 'text-danger: failed',
      }}
    />
  ),
};

export const Data: Story = {
  render: () => (
    <ColorSwatches
      tokens={DATA_COLORS}
      notes={{
        meter: 'fill-meter: a meter below its warning level',
        'meter-track': 'fill-meter-track: the unfilled part of that meter',
        'warn-track': 'fill-warn-track: behind a fill-warn meter',
        'danger-track': 'fill-danger-track: behind a fill-danger meter',
        'series-1': 'text-series-1: the first chart series',
        'series-2': 'text-series-2: the second chart series',
        'series-3': 'text-series-3: the third and last chart series',
      }}
    />
  ),
};

export const Contrast: Story = {
  render: () => (
    <>
      {CONTRAST_RULES.map(rule => (
        <ContrastTable key={rule.name} rule={rule} />
      ))}
    </>
  ),
};

export const Exempt: Story = {
  render: () => (
    <Table
      head={['token', 'needs no contrast rule because it']}
      rows={Object.entries(CONTRAST_EXEMPT).map(([token, reason]) => ({ key: token, cells: [token, reason] }))}
    />
  ),
};
