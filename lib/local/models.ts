import { CLIENT_CONFIG } from '@/lib/config';

/**
 * Catalog of on-device models. Every entry is a Hugging Face repo that ships ONNX
 * weights loadable by Transformers.js. Weights are downloaded straight from the Hub
 * into the browser's Cache Storage on first use and reused afterwards.
 */

export type LocalDtype = 'q4f16' | 'q4' | 'q8';
export type LocalDevice = 'webgpu' | 'wasm';
export type LocalModelKey = `local:${string}`;

export interface LocalModelSpec {
  kind: 'local';
  key: LocalModelKey;
  /** Hugging Face repo id, e.g. `onnx-community/Qwen2.5-0.5B-Instruct`. */
  repoId: string;
  label: string;
  description: string;
  parameters: string;
  /** Architectural context window in tokens. */
  contextWindow: number;
  /** Document tokens fed per generation pass — kept well below the window for speed and VRAM. */
  promptBudget: number;
  maxOutputTokens: number;
  /** Approximate bytes fetched per dtype (ONNX weights + tokenizer/config); `null` when unknown. */
  downloadBytes: Record<LocalDtype, number> | null;
  /** Always true: the on-device engine has no credentials to be missing. */
  available: boolean;
}

export const LOCAL_KEY_PREFIX = 'local:';

export function localKey(repoId: string): LocalModelKey {
  return `${LOCAL_KEY_PREFIX}${repoId}`;
}

export function isLocalKey(key: string | null | undefined): key is LocalModelKey {
  return typeof key === 'string' && key.startsWith(LOCAL_KEY_PREFIX);
}

// Sizes come from the Hub file listings (onnx/model_q4f16.onnx, model_q4.onnx, model_quantized.onnx).
export const BUILT_IN_LOCAL_MODELS: readonly LocalModelSpec[] = [
  {
    kind: 'local',
    key: localKey('onnx-community/Qwen2.5-0.5B-Instruct'),
    repoId: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: 'Qwen2.5 0.5B',
    description: 'Best default: strong instruction-following for its size',
    parameters: '0.5B',
    contextWindow: 32_768,
    promptBudget: 4_000,
    maxOutputTokens: 1_024,
    downloadBytes: { q4f16: 494_493_928, q4: 797_647_166, q8: 523_586_903 },
    available: true,
  },
  {
    kind: 'local',
    key: localKey('HuggingFaceTB/SmolLM2-360M-Instruct'),
    repoId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    label: 'SmolLM2 360M',
    description: 'Smallest download — fastest first run, lighter analysis',
    parameters: '360M',
    contextWindow: 8_192,
    promptBudget: 2_500,
    maxOutputTokens: 768,
    downloadBytes: { q4f16: 276_114_281, q4: 391_320_252, q8: 367_941_677 },
    available: true,
  },
  {
    kind: 'local',
    key: localKey('onnx-community/Qwen2.5-1.5B-Instruct'),
    repoId: 'onnx-community/Qwen2.5-1.5B-Instruct',
    label: 'Qwen2.5 1.5B',
    description: 'Higher quality; needs a capable GPU and a larger download',
    parameters: '1.5B',
    contextWindow: 32_768,
    promptBudget: 4_000,
    maxOutputTokens: 1_024,
    downloadBytes: { q4f16: 1_233_369_286, q4: 1_799_056_936, q8: 1_590_444_639 },
    available: true,
  },
];

const REPO_ID = /^[\w.-]+\/[\w.-]+$/;

function customLocalModel(repoId: string): LocalModelSpec {
  return {
    kind: 'local',
    key: localKey(repoId),
    repoId,
    label: repoId.split('/').pop() ?? repoId,
    description: 'Custom model from NEXT_PUBLIC_DEFAULT_LOCAL_MODEL',
    parameters: 'custom',
    contextWindow: 8_192,
    promptBudget: 2_500,
    maxOutputTokens: 768,
    downloadBytes: null,
    available: true,
  };
}

let catalog: LocalModelSpec[] | null = null;

/** Built-ins plus the configured default model when it is not already listed. */
export function getLocalModels(): LocalModelSpec[] {
  if (catalog) return catalog;
  const models = [...BUILT_IN_LOCAL_MODELS];
  const configured = CLIENT_CONFIG.defaultLocalModel;
  if (REPO_ID.test(configured) && !models.some((m) => m.repoId === configured)) {
    models.unshift(customLocalModel(configured));
  }
  catalog = models;
  return catalog;
}

export function findLocalModel(key: string | null | undefined): LocalModelSpec | null {
  if (!isLocalKey(key)) return null;
  return getLocalModels().find((model) => model.key === key) ?? null;
}

export function getDefaultLocalModel(): LocalModelSpec {
  const models = getLocalModels();
  return models.find((m) => m.repoId === CLIENT_CONFIG.defaultLocalModel) ?? models[0];
}

/**
 * Picks the quantisation that fits the runtime: `q4f16` needs WebGPU shader-f16, `q4` runs
 * on any WebGPU device, and `q8` is the CPU (WASM) fallback.
 */
export function pickRuntime(support: { supported: boolean; fp16: boolean }): {
  device: LocalDevice;
  dtype: LocalDtype;
} {
  if (!support.supported) return { device: 'wasm', dtype: 'q8' };
  return { device: 'webgpu', dtype: support.fp16 ? 'q4f16' : 'q4' };
}

export function expectedDownloadBytes(model: LocalModelSpec, dtype: LocalDtype): number {
  return model.downloadBytes?.[dtype] ?? 0;
}
