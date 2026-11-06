import 'server-only';

import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { createProviderRegistry, type LanguageModel } from 'ai';
import {
  BUILT_IN_MODELS,
  PROVIDERS,
  parseModelKey,
  type ModelKey,
  type ModelOption,
  type ModelSpec,
  type ProviderId,
} from './models';

/**
 * A single registry routes `provider:model-id` keys to provider implementations.
 * Adding a provider = install its `@ai-sdk/*` package, add it here and to `PROVIDERS`.
 * Each default provider instance reads its own API key from the environment.
 */
const registry = createProviderRegistry({ anthropic, openai, google });

const CUSTOM_MODEL_DEFAULTS = { contextWindow: 128_000, maxOutputTokens: 16_384 } as const;

export class ModelResolutionError extends Error {
  readonly status: 400 | 503;

  constructor(message: string, status: 400 | 503) {
    super(message);
    this.name = 'ModelResolutionError';
    this.status = status;
  }
}

export function isProviderConfigured(provider: ProviderId): boolean {
  return Boolean(process.env[PROVIDERS[provider].envKey]?.trim());
}

function customModel(rawKey: string, contextWindow?: number): ModelSpec | null {
  const parsed = parseModelKey(rawKey);
  if (!parsed) {
    console.warn(`[DocuLens] Ignoring invalid model key "${rawKey}" (expected provider:model-id).`);
    return null;
  }
  return {
    ...parsed,
    label: parsed.modelId,
    description: 'Custom model from environment configuration',
    contextWindow:
      contextWindow && contextWindow > 0 ? contextWindow : CUSTOM_MODEL_DEFAULTS.contextWindow,
    maxOutputTokens: CUSTOM_MODEL_DEFAULTS.maxOutputTokens,
  };
}

let catalogCache: ModelSpec[] | null = null;

/** Built-in catalog + `DOCULENS_EXTRA_MODELS` + `DOCULENS_DEFAULT_MODEL` (if not listed). */
function modelCatalog(): ModelSpec[] {
  if (catalogCache) return catalogCache;

  const specs = new Map<string, ModelSpec>(BUILT_IN_MODELS.map((model) => [model.key, model]));

  const extras = (process.env.DOCULENS_EXTRA_MODELS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of extras) {
    const [key, contextWindow] = entry.split('=');
    const spec = customModel(key.trim(), Number(contextWindow));
    if (spec && !specs.has(spec.key)) specs.set(spec.key, spec);
  }

  const defaultKey = process.env.DOCULENS_DEFAULT_MODEL?.trim();
  if (defaultKey && !specs.has(defaultKey)) {
    const spec = customModel(defaultKey);
    if (spec) specs.set(spec.key, spec);
  }

  catalogCache = [...specs.values()];
  return catalogCache;
}

/** Catalog annotated with availability. Safe to send to the client (no secrets). */
export function listModels(): ModelOption[] {
  return modelCatalog().map((spec) => ({ ...spec, available: isProviderConfigured(spec.provider) }));
}

/** `DOCULENS_DEFAULT_MODEL` when usable, otherwise the first model with a configured key. */
export function getDefaultModelKey(models: ModelOption[] = listModels()): ModelKey | null {
  const preferred = process.env.DOCULENS_DEFAULT_MODEL?.trim();
  const model =
    models.find((m) => m.available && m.key === preferred) ?? models.find((m) => m.available);
  return model?.key ?? null;
}

/**
 * Resolves a runtime model key (from the user's selection, or the environment default)
 * into an AI SDK `LanguageModel`. Only catalogued models are routable, so clients cannot
 * invoke arbitrary — potentially expensive — models with your keys.
 */
export function resolveModel(requestedKey?: string | null): { model: LanguageModel; spec: ModelSpec } {
  const models = listModels();
  const key = requestedKey?.trim() || getDefaultModelKey(models);

  if (!key) {
    throw new ModelResolutionError(
      'No AI provider is configured. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY to .env.local.',
      503,
    );
  }

  const spec = models.find((m) => m.key === key);
  if (!spec) {
    throw new ModelResolutionError(
      `Model "${key}" is not enabled. Add it to DOCULENS_EXTRA_MODELS to allow it.`,
      400,
    );
  }

  if (!spec.available) {
    const provider = PROVIDERS[spec.provider];
    throw new ModelResolutionError(
      `${provider.label} is not configured on the server (missing ${provider.envKey}).`,
      503,
    );
  }

  return { model: registry.languageModel(spec.key), spec };
}
