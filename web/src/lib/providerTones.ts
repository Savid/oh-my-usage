/** The classes that dress a provider's data in its colour. */
export interface ProviderTone {
  /** Text colour for the provider's mark. */
  icon: string;
  /** The filled part of a gauge. */
  fill: string;
  /** The empty part of a gauge. */
  track: string;
  /** The line of a chart. */
  line: string;
  /** The glow under that line, as a text colour its gradient stops inherit. */
  glow: string;
}

// Written out in full: Tailwind compiles only the class names it can read here.
const TONES = {
  anthropic: {
    icon: 'text-anthropic',
    fill: 'fill-anthropic',
    track: 'fill-anthropic-track',
    line: 'stroke-anthropic',
    glow: 'text-anthropic-track',
  },
  openai: {
    icon: 'text-openai',
    fill: 'fill-openai',
    track: 'fill-openai-track',
    line: 'stroke-openai',
    glow: 'text-openai-track',
  },
  // For a provider whose own mark is black and white: light grey on the dark theme, dark grey on the light.
  mono: {
    icon: 'text-mono',
    fill: 'fill-mono',
    track: 'fill-mono-track',
    line: 'stroke-mono',
    glow: 'text-mono-track',
  },
  openrouter: {
    icon: 'text-openrouter',
    fill: 'fill-openrouter',
    track: 'fill-openrouter-track',
    line: 'stroke-openrouter',
    glow: 'text-openrouter-track',
  },
} satisfies Record<string, ProviderTone>;

/** A provider with no colour of its own: a quiet mark and the app's own data colour. */
const PLAIN: ProviderTone = {
  icon: 'text-muted',
  fill: 'fill-meter',
  track: 'fill-meter-track',
  line: 'stroke-meter',
  glow: 'text-meter-track',
};

// omp's provider IDs. A provider whose brand has a colour of its own that
// would pass for the default indigo, a status colour or another provider's
// (Google's and Meta's blues, Qwen's violet, MiniMax's red) keeps the default.
const PROVIDER_TONES: Readonly<Record<string, ProviderTone>> = {
  anthropic: TONES.anthropic,
  apple: TONES.mono,
  'cline-pass': TONES.mono,
  cursor: TONES.mono,
  'github-copilot': TONES.mono,
  'kimi-code': TONES.mono,
  moonshot: TONES.mono,
  ollama: TONES.mono,
  'ollama-cloud': TONES.mono,
  openai: TONES.openai,
  'openai-codex': TONES.openai,
  'openai-codex-device': TONES.openai,
  'opencode-go': TONES.mono,
  'opencode-zen': TONES.mono,
  openrouter: TONES.openrouter,
  'vercel-ai-gateway': TONES.mono,
  xai: TONES.mono,
  'xai-oauth': TONES.mono,
  zai: TONES.mono,
  'zai-coding-plan': TONES.mono,
};

/** The colour a provider's usage is drawn in. */
export function providerTone(provider: string): ProviderTone {
  return PROVIDER_TONES[provider] ?? PLAIN;
}
