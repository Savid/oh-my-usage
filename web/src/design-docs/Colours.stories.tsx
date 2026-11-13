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
        mono: 'text-mono: a provider whose mark is black and white (OpenCode, Cursor, GitHub Copilot, xAI, Ollama…)',
        'mono-track': "fill-mono-track: its gauge's empty part, and the glow under its chart",
        openrouter: "text-openrouter: OpenRouter's mark, gauge and chart line",
        'openrouter-track': "fill-openrouter-track: its gauge's empty part, and the glow under its chart",
        alibaba: 'text-alibaba: Alibaba Cloud orange (Lobe colour mark)',
        'alibaba-track': "fill-alibaba-track: its gauge's empty part, and the glow under its chart",
        qwen: "text-qwen: Qwen's violet, from its chat app and mark",
        'qwen-track': "fill-qwen-track: its gauge's empty part, and the glow under its chart",
        aws: "text-aws: AWS's orange: Bedrock is AWS's",
        'aws-track': "fill-aws-track: its gauge's empty part, and the glow under its chart",
        azure: 'text-azure: Azure blue (Lobe colour mark)',
        'azure-track': "fill-azure-track: its gauge's empty part, and the glow under its chart",
        cerebras: 'text-cerebras: Cerebras orange (Lobe colour mark)',
        'cerebras-track': "fill-cerebras-track: its gauge's empty part, and the glow under its chart",
        cloudflare: 'text-cloudflare: Cloudflare orange (Lobe colour mark), Workers AI too',
        'cloudflare-track': "fill-cloudflare-track: its gauge's empty part, and the glow under its chart",
        deepinfra: 'text-deepinfra: DeepInfra blue (Lobe colour mark)',
        'deepinfra-track': "fill-deepinfra-track: its gauge's empty part, and the glow under its chart",
        deepseek: 'text-deepseek: DeepSeek blue (Lobe colour mark)',
        'deepseek-track': "fill-deepseek-track: its gauge's empty part, and the glow under its chart",
        devin: "text-devin: Devin's teal-green, the middle of its mark",
        'devin-track': "fill-devin-track: its gauge's empty part, and the glow under its chart",
        exa: 'text-exa: Exa blue (Lobe colour mark)',
        'exa-track': "fill-exa-track: its gauge's empty part, and the glow under its chart",
        fireworks: 'text-fireworks: Fireworks purple (Lobe colour mark), Fire Pass too',
        'fireworks-track': "fill-fireworks-track: its gauge's empty part, and the glow under its chart",
        gitlab: 'text-gitlab: GitLab orange',
        'gitlab-track': "fill-gitlab-track: its gauge's empty part, and the glow under its chart",
        google: 'text-google: Gemini blue (Lobe colour mark): Gemini, Gemini CLI, Antigravity, Vertex',
        'google-track': "fill-google-track: its gauge's empty part, and the glow under its chart",
        groq: 'text-groq: Groq orange-red',
        'groq-track': "fill-groq-track: its gauge's empty part, and the glow under its chart",
        huggingface: 'text-huggingface: Hugging Face yellow (Lobe colour mark)',
        'huggingface-track': "fill-huggingface-track: its gauge's empty part, and the glow under its chart",
        kagi: 'text-kagi: Kagi yellow',
        'kagi-track': "fill-kagi-track: its gauge's empty part, and the glow under its chart",
        kilo: "text-kilo: Kilo Code's yellow square",
        'kilo-track': "fill-kilo-track: its gauge's empty part, and the glow under its chart",
        kimi: "text-kimi: Kimi's blue dot (Lobe colour mark), Moonshot too",
        'kimi-track': "fill-kimi-track: its gauge's empty part, and the glow under its chart",
        lmstudio: "text-lmstudio: LM Studio's purple app icon",
        'lmstudio-track': "fill-lmstudio-track: its gauge's empty part, and the glow under its chart",
        meta: 'text-meta: Meta blue (Lobe colour mark), Muse Code too',
        'meta-track': "fill-meta-track: its gauge's empty part, and the glow under its chart",
        minimax: "text-minimax: MiniMax's magenta (Lobe colour mark)",
        'minimax-track': "fill-minimax-track: its gauge's empty part, and the glow under its chart",
        mistral: 'text-mistral: Mistral orange (Lobe colour mark)',
        'mistral-track': "fill-mistral-track: its gauge's empty part, and the glow under its chart",
        novita: 'text-novita: Novita green (Lobe colour mark)',
        'novita-track': "fill-novita-track: its gauge's empty part, and the glow under its chart",
        nvidia: 'text-nvidia: NVIDIA green',
        'nvidia-track': "fill-nvidia-track: its gauge's empty part, and the glow under its chart",
        perplexity: 'text-perplexity: Perplexity turquoise (Lobe colour mark)',
        'perplexity-track': "fill-perplexity-track: its gauge's empty part, and the glow under its chart",
        baidu: 'text-baidu: Baidu AI Cloud blue (Lobe colour mark): Qianfan',
        'baidu-track': "fill-baidu-track: its gauge's empty part, and the glow under its chart",
        sakana: 'text-sakana: Sakana AI red (Lobe colour mark)',
        'sakana-track': "fill-sakana-track: its gauge's empty part, and the glow under its chart",
        sambanova: 'text-sambanova: SambaNova orange (Lobe colour mark)',
        'sambanova-track': "fill-sambanova-track: its gauge's empty part, and the glow under its chart",
        scaleway: 'text-scaleway: Scaleway purple',
        'scaleway-track': "fill-scaleway-track: its gauge's empty part, and the glow under its chart",
        siliconflow: 'text-siliconflow: SiliconFlow violet (Lobe colour mark)',
        'siliconflow-track': "fill-siliconflow-track: its gauge's empty part, and the glow under its chart",
        snowflake: 'text-snowflake: Snowflake blue',
        'snowflake-track': "fill-snowflake-track: its gauge's empty part, and the glow under its chart",
        stepfun: 'text-stepfun: StepFun blue (Lobe colour mark)',
        'stepfun-track': "fill-stepfun-track: its gauge's empty part, and the glow under its chart",
        tavily: 'text-tavily: Tavily blue (Lobe colour mark)',
        'tavily-track': "fill-tavily-track: its gauge's empty part, and the glow under its chart",
        together: "text-together: together.ai's pink (Lobe colour mark)",
        'together-track': "fill-together-track: its gauge's empty part, and the glow under its chart",
        venice: 'text-venice: Venice red-orange (Lobe colour mark)',
        'venice-track': "fill-venice-track: its gauge's empty part, and the glow under its chart",
        vllm: "text-vllm: vLLM's yellow V (Lobe colour mark)",
        'vllm-track': "fill-vllm-track: its gauge's empty part, and the glow under its chart",
        xiaomi: 'text-xiaomi: Xiaomi orange',
        'xiaomi-track': "fill-xiaomi-track: its gauge's empty part, and the glow under its chart",
        zhipu: 'text-zhipu: Zhipu blue (Lobe colour mark)',
        'zhipu-track': "fill-zhipu-track: its gauge's empty part, and the glow under its chart",
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
