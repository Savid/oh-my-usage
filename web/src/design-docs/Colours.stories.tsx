import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ACCENT_COLORS,
  BORDER_COLORS,
  BRAND_COLORS,
  CONTRAST_EXEMPT,
  CONTRAST_RULES,
  DATA_COLORS,
  PROVIDER_COLORS,
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
      notes={{
        background: 'bg-background: the page',
        surface: 'bg-surface: panels, the header',
        raised: 'bg-raised: a cell in a panel, a hovered control',
      }}
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
        meter: 'fill-meter: what is used, for a provider with no colour of its own',
        'meter-track': "fill-meter-track: that gauge's empty part, and the glow under its chart",
        'series-1': 'text-series-1: the first chart series',
        'series-2': 'text-series-2: the second chart series',
        'series-3': 'text-series-3: the third and last chart series',
      }}
    />
  ),
};

export const Providers: Story = {
  render: () => (
    <ColorSwatches
      tokens={PROVIDER_COLORS}
      notes={{
        anthropic: "text-anthropic: Anthropic's mark, gauge and chart line",
        'anthropic-track': "fill-anthropic-track: its gauge's empty part, and the glow under its chart",
        openai: "text-openai: OpenAI's mark, gauge and chart line",
        'openai-track': "fill-openai-track: its gauge's empty part, and the glow under its chart",
        mono: 'text-mono: for a provider whose mark is black and white (OpenCode, Cursor, GitHub Copilot, xAI, Ollama…)',
        'mono-track': "fill-mono-track: its gauge's empty part, and the glow under its chart",
        openrouter: "text-openrouter: OpenRouter's mark, gauge and chart line",
        'openrouter-track': "fill-openrouter-track: its gauge's empty part, and the glow under its chart",
      }}
    />
  ),
};

export const Brand: Story = {
  render: () => (
    <ColorSwatches
      tokens={BRAND_COLORS}
      notes={{
        'mark-magenta': "text-mark-magenta: where the logo's gradient starts",
        'mark-iris': 'text-mark-iris: its middle',
        'mark-cyan': 'text-mark-cyan: where it ends',
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
