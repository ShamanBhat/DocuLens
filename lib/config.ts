/**
 * Public, client-side configuration. Every value is read through a *literal*
 * `process.env.NEXT_PUBLIC_*` access so Next.js can inline it into the bundle.
 * Nothing secret belongs here — API keys are read server-side only.
 */

const DEFAULT_LOCAL_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

/** `null` means "use the library's default (CDN) location". */
function resolveOrtPath(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value.toLowerCase() === 'cdn') return null;
  return withTrailingSlash(value || '/ort/');
}

export const CLIENT_CONFIG = {
  /** Hugging Face repo id selected on first visit. */
  defaultLocalModel: (process.env.NEXT_PUBLIC_DEFAULT_LOCAL_MODEL ?? '').trim() || DEFAULT_LOCAL_MODEL,
  /** Host the model weights are fetched from (Hub layout). */
  hfRemoteHost: withTrailingSlash((process.env.NEXT_PUBLIC_HF_REMOTE_HOST ?? '').trim() || 'https://huggingface.co'),
  ortWasmPath: resolveOrtPath(process.env.NEXT_PUBLIC_ORT_WASM_PATH),
  autoDownload: (process.env.NEXT_PUBLIC_AUTO_DOWNLOAD ?? 'on').trim().toLowerCase() !== 'off',
  cloudFallback: (process.env.NEXT_PUBLIC_CLOUD_FALLBACK ?? 'on').trim().toLowerCase() !== 'off',
} as const;
