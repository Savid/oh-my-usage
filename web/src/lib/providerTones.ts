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
  opencode: {
    icon: 'text-opencode',
    fill: 'fill-opencode',
    track: 'fill-opencode-track',
    line: 'stroke-opencode',
    glow: 'text-opencode-track',
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

const PROVIDER_TONES: Readonly<Record<string, ProviderTone>> = {
  anthropic: TONES.anthropic,
  openai: TONES.openai,
  'openai-codex': TONES.openai,
  opencode: TONES.opencode,
  'opencode-go': TONES.opencode,
  openrouter: TONES.openrouter,
};

/** The colour a provider's usage is drawn in. */
export function providerTone(provider: string): ProviderTone {
  return PROVIDER_TONES[provider] ?? PLAIN;
}
