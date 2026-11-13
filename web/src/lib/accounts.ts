import type { Account, Limit } from '@/api';

// Every provider omp (v18.19.0) can hold a credential for, by its ID. The
// names are omp's own, shortened where omp adds what the login is for.
const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  abliteration: 'Abliteration',
  aiand: 'ai&',
  aimlapi: 'AIML API',
  'alibaba-coding-plan': 'Alibaba Coding Plan',
  'alibaba-token-plan': 'QwenCloud Token Plan',
  'amazon-bedrock': 'Amazon Bedrock',
  anthropic: 'Anthropic',
  apple: 'Apple Foundation Models',
  azure: 'Azure OpenAI',
  baseten: 'Baseten',
  'bedrock-mantle': 'Amazon Bedrock Mantle',
  cerebras: 'Cerebras',
  'charm-hyper': 'Charm Hyper',
  'cline-pass': 'ClinePass',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
  commandcode: 'Command Code',
  coralbricks: 'CoralBricks',
  coreweave: 'CoreWeave',
  cursor: 'Cursor',
  deepinfra: 'DeepInfra',
  deepseek: 'DeepSeek',
  devin: 'Devin',
  'devin-cli': 'Devin CLI',
  'devin-windsurf': 'Devin Windsurf',
  exa: 'Exa',
  'factory-droid': 'Factory Droid',
  firepass: 'Fire Pass',
  fireworks: 'Fireworks',
  'github-copilot': 'GitHub Copilot',
  'gitlab-duo': 'GitLab Duo',
  'gitlab-duo-agent': 'GitLab Duo Agent',
  'gmi-cloud': 'GMI Cloud',
  google: 'Google Gemini',
  'google-antigravity': 'Google Antigravity',
  'google-gemini-cli': 'Gemini CLI',
  'google-vertex': 'Google Vertex AI',
  groq: 'Groq',
  helmcode: 'Helmcode',
  huggingface: 'Hugging Face',
  inception: 'Inception',
  kagi: 'Kagi',
  kilo: 'Kilo Gateway',
  'kimi-code': 'Kimi Code',
  liquid: 'Liquid AI',
  litellm: 'LiteLLM',
  'llama.cpp': 'llama.cpp',
  'lm-studio': 'LM Studio',
  local: 'Local models',
  meta: 'Meta',
  minimax: 'MiniMax',
  'minimax-code': 'MiniMax Token Plan',
  'minimax-code-cn': 'MiniMax Token Plan (China)',
  mistral: 'Mistral',
  modular: 'Modular',
  moonshot: 'Moonshot',
  'muse-code': 'Muse Code',
  nanogpt: 'NanoGPT',
  novita: 'Novita',
  nvidia: 'NVIDIA',
  ollama: 'Ollama',
  'ollama-cloud': 'Ollama Cloud',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI Codex',
  'openai-codex-device': 'OpenAI Codex (device)',
  'opencode-go': 'OpenCode Go',
  'opencode-zen': 'OpenCode Zen',
  openrouter: 'OpenRouter',
  otari: 'Otari',
  parallel: 'Parallel',
  perplexity: 'Perplexity',
  qianfan: 'Qianfan',
  'qwen-portal': 'Qwen Portal',
  sakana: 'Sakana AI',
  sambanova: 'SambaNova',
  scaleway: 'Scaleway',
  siliconflow: 'SiliconFlow',
  'siliconflow-cn': 'SiliconFlow (China)',
  'singularityapi-dev': 'SingularityAPI',
  'singularityapi-tech': 'SingularityAPI Reserved Lanes',
  snowflake: 'Snowflake Cortex',
  stencil: 'Stencil',
  stepfun: 'StepFun',
  synthetic: 'Synthetic',
  tavily: 'Tavily',
  together: 'Together',
  typesafe: 'TypeSafe',
  umans: 'Umans',
  venice: 'Venice',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  vllm: 'vLLM',
  'wafer-serverless': 'Wafer Serverless',
  web: 'Web search',
  xai: 'xAI',
  'xai-oauth': 'xAI Grok',
  xiaomi: 'Xiaomi MiMo',
  'xiaomi-token-plan-ams': 'Xiaomi Token Plan (Europe)',
  'xiaomi-token-plan-cn': 'Xiaomi Token Plan (China)',
  'xiaomi-token-plan-sgp': 'Xiaomi Token Plan (Singapore)',
  'yolo-auto': 'Yolo-Auto',
  zai: 'Z.ai',
  'zai-coding-plan': 'Z.ai Coding Plan',
  zenmux: 'ZenMux',
  'zhipu-coding-plan': 'Zhipu Coding Plan',
};

/** The provider IDs this build knows, in alphabetical order. */
export const KNOWN_PROVIDERS: readonly string[] = Object.keys(PROVIDER_NAMES);

/** A provider's display name; an ID this build does not know is shown as it is. */
export function providerName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

/** What to call an account: its email, or its provider and what kind of credential it is. */
export function accountTitle(account: Account): string {
  if (account.email) return account.email;
  return `${providerName(account.provider)} ${account.kind === 'api_key' ? 'API key' : 'account'}`;
}

export interface ProviderGroup {
  provider: string;
  accounts: Account[];
}

/** Accounts grouped by provider, keeping the order the server sent. */
export function groupByProvider(accounts: readonly Account[]): ProviderGroup[] {
  const groups: ProviderGroup[] = [];
  for (const account of accounts) {
    const group = groups.find(candidate => candidate.provider === account.provider);
    if (group) group.accounts.push(account);
    else groups.push({ provider: account.provider, accounts: [account] });
  }
  return groups;
}

/**
 * A limit's name without what the row already says: the product's name in
 * front ("Claude 7 Day") and the word "limit" behind ("Weekly limit").
 */
export function shortLimitLabel(limit: Limit): string {
  const short = limit.label
    .replace(/^Claude\s+/i, '')
    .replace(/\s+limit$/i, '')
    .replace(/[()]/g, '');
  return short || limit.label;
}

/**
 * The window an account's row is drawn for: of those that report usage, the
 * one whose reset is furthest away, which is the budget the account lives on
 * (a week, not five hours). Ties go to the first listed; without any reset
 * time, the first that reports usage.
 */
export function primaryLimit(limits: readonly Limit[]): Limit | undefined {
  let best: Limit | undefined;
  let bestReset = -Infinity;
  for (const limit of limits) {
    if (limit.usedFraction === undefined) continue;
    const reset = limit.resetsAt ? Date.parse(limit.resetsAt) : -Infinity;
    if (!best || reset > bestReset) {
      best = limit;
      bestReset = reset;
    }
  }
  return best;
}

/** How close a limit is to stopping the account. */
export type LimitSeverity = 'normal' | 'warn' | 'danger';

/** At or above this used share, a limit is drawn as a warning. */
const WARN_USED = 0.8;

/** The severity of a used share: spent, nearly spent, or neither. */
export function severityOf(used: number): LimitSeverity {
  if (used >= 1) return 'danger';
  if (used >= WARN_USED) return 'warn';
  return 'normal';
}

/** A limit's severity, from the provider's own status first and its used share second. */
export function limitSeverity(limit: Limit): LimitSeverity {
  const fromShare = severityOf(limit.usedFraction ?? 0);
  if (limit.status === 'exhausted' || fromShare === 'danger') return 'danger';
  if (limit.status === 'warning' || fromShare === 'warn') return 'warn';
  return 'normal';
}
