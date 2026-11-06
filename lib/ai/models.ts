/**
 * Client-safe model catalog. Contains no secrets — per-provider availability is
 * resolved on the server (see `registry.ts`) from which API keys are configured.
 *
 * Every model is addressed by a runtime key `provider:model-id`, which the AI SDK
 * provider registry routes to the right provider implementation.
 */

export const PROVIDERS = {
  anthropic: { label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY' },
  openai: { label: 'OpenAI', envKey: 'OPENAI_API_KEY' },
  google: { label: 'Google Gemini', envKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
} as const satisfies Record<string, { label: string; envKey: string }>;

export type ProviderId = keyof typeof PROVIDERS;

/** Runtime routing key, e.g. `anthropic:claude-sonnet-4-5`. */
export type ModelKey = `${ProviderId}:${string}`;

export interface ModelSpec {
  key: ModelKey;
  provider: ProviderId;
  modelId: string;
  label: string;
  description: string;
  /** Usable context in tokens (prompt + completion) used for budget checks. */
  contextWindow: number;
  /** Maximum completion tokens supported by the model. */
  maxOutputTokens: number;
}

export interface ModelOption extends ModelSpec {
  /** True when the provider's API key is configured on the server. */
  available: boolean;
}

export const BUILT_IN_MODELS: readonly ModelSpec[] = [
  {
    key: 'anthropic:claude-sonnet-4-5',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    description: 'Best balance of depth and speed for contract review',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    key: 'anthropic:claude-opus-4-1',
    provider: 'anthropic',
    modelId: 'claude-opus-4-1',
    label: 'Claude Opus 4.1',
    description: 'Maximum reasoning depth for complex deal bundles',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
  },
  {
    key: 'anthropic:claude-haiku-4-5',
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    description: 'Fast, low-cost first-pass triage',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    key: 'openai:gpt-5',
    provider: 'openai',
    modelId: 'gpt-5',
    label: 'GPT-5',
    description: 'Frontier reasoning for nuanced clause analysis',
    contextWindow: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    key: 'openai:gpt-5-mini',
    provider: 'openai',
    modelId: 'gpt-5-mini',
    label: 'GPT-5 mini',
    description: 'Cost-efficient reasoning for routine agreements',
    contextWindow: 272_000,
    maxOutputTokens: 128_000,
  },
  {
    key: 'openai:gpt-4.1',
    provider: 'openai',
    modelId: 'gpt-4.1',
    label: 'GPT-4.1',
    description: '1M-token context for massive bundles',
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
  },
  {
    key: 'google:gemini-2.5-pro',
    provider: 'google',
    modelId: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: '1M-token context with built-in thinking',
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
  },
  {
    key: 'google:gemini-2.5-flash',
    provider: 'google',
    modelId: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Fast 1M-token context at low cost',
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
  },
];

export function isProviderId(value: string): value is ProviderId {
  return Object.hasOwn(PROVIDERS, value);
}

/** Parses `provider:model-id`. Model ids may themselves contain `:` (e.g. fine-tunes). */
export function parseModelKey(raw: string): Pick<ModelSpec, 'key' | 'provider' | 'modelId'> | null {
  const separator = raw.indexOf(':');
  if (separator <= 0) return null;

  const provider = raw.slice(0, separator).trim();
  const modelId = raw.slice(separator + 1).trim();
  if (!isProviderId(provider) || !/^[\w.:/@-]+$/.test(modelId)) return null;

  return { key: `${provider}:${modelId}`, provider, modelId };
}
