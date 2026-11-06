/**
 * On-device AI worker.
 *
 * Runs Hugging Face Transformers.js (ONNX Runtime Web) off the main thread so multi-hundred-MB
 * model downloads, WebGPU shader compilation and token generation never freeze the UI.
 * Model weights are fetched from the Hugging Face Hub by the library itself and persisted in the
 * browser's Cache Storage — there is no DocuLens server in this path.
 *
 * Protocol: see `lib/local/protocol.ts`. One worker hosts one model; the client terminates the
 * worker to unload it, which also releases GPU memory.
 */
import {
  env,
  InterruptableStoppingCriteria,
  ModelRegistry,
  pipeline,
  TextStreamer,
  type ProgressInfo,
} from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse } from '@/lib/local/protocol';

type InitRequest = Extract<WorkerRequest, { type: 'init' }>;
type GenerateRequest = Extract<WorkerRequest, { type: 'generate' }>;
type CheckCacheRequest = Extract<WorkerRequest, { type: 'check-cache' }>;

type TextGenerator = Awaited<ReturnType<typeof createGenerator>>;

/** Loose view of the library's progress events (fields vary by status). */
interface ProgressEvent {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

const PROGRESS_THROTTLE_MS = 80;

let generator: TextGenerator | null = null;
let activeJob: { id: number; stop: InterruptableStoppingCriteria } | null = null;
// Serialises init/generate so a second request can never race the first one's session.
let queue: Promise<void> = Promise.resolve();

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

function configureEnvironment({ remoteHost, wasmPaths }: Pick<InitRequest, 'remoteHost' | 'wasmPaths'>): void {
  env.allowLocalModels = false; // never probe /models/ on the app's own origin
  env.allowRemoteModels = true;
  env.useBrowserCache = true; // weights persist in Cache Storage across visits
  env.remoteHost = remoteHost;

  const wasm = env.backends.onnx.wasm;
  if (wasm && wasmPaths) wasm.wasmPaths = wasmPaths;
}

function createProgressReporter(): (info: ProgressInfo) => void {
  const lastSent = new Map<string, number>();

  return (info) => {
    const event = info as unknown as ProgressEvent;
    const file = event.file;
    if (!file) return;

    switch (event.status) {
      case 'initiate':
        post({ type: 'file', file, status: 'start', loaded: 0, total: 0 });
        break;
      case 'progress': {
        const now = performance.now();
        const loaded = event.loaded ?? 0;
        const total = event.total ?? 0;
        // Always forward the final chunk; throttle the rest to keep the UI thread calm.
        if (loaded < total && now - (lastSent.get(file) ?? 0) < PROGRESS_THROTTLE_MS) break;
        lastSent.set(file, now);
        post({ type: 'file', file, status: 'progress', loaded, total });
        break;
      }
      case 'done':
        post({ type: 'file', file, status: 'done', loaded: event.total ?? event.loaded ?? 0, total: event.total ?? 0 });
        break;
    }
  };
}

function createGenerator(request: InitRequest) {
  return pipeline('text-generation', request.modelId, {
    device: request.device,
    dtype: request.dtype,
    progress_callback: createProgressReporter(),
  });
}

async function handleCheckCache(request: CheckCacheRequest): Promise<void> {
  let cached = false;
  try {
    const registry = ModelRegistry as unknown as {
      is_cached?: (modelId: string, options?: { dtype?: string; device?: string }) => Promise<boolean>;
    };
    cached = (await registry.is_cached?.(request.modelId, { dtype: request.dtype, device: request.device })) ?? false;
  } catch {
    cached = false; // The probe is advisory; a failure just means "assume a download".
  }
  post({ type: 'cache', cached });
}

async function handleInit(request: InitRequest): Promise<void> {
  const startedAt = performance.now();
  try {
    configureEnvironment(request);
    generator = await createGenerator(request);

    // One-token warm-up compiles the GPU kernels now, so the first real request is fast
    // and a broken WebGPU setup fails here (where the client can fall back to WASM).
    await generator([{ role: 'user', content: 'Hi' }], { max_new_tokens: 1, do_sample: false });

    post({ type: 'ready', device: request.device, dtype: request.dtype, loadMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    generator = null;
    post({ type: 'error', phase: 'init', message: describeError(error) });
  }
}

async function handleGenerate(request: GenerateRequest): Promise<void> {
  const { id, messages, maxNewTokens, temperature, repetitionPenalty } = request;

  if (!generator) {
    post({ type: 'error', phase: 'generate', id, message: 'The on-device model is not loaded.' });
    return;
  }

  const stop = new InterruptableStoppingCriteria();
  activeJob = { id, stop };

  let text = '';
  let tokens = 0;
  const startedAt = performance.now();

  try {
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (delta: string) => {
        text += delta;
        post({ type: 'token', id, text: delta, tokens });
      },
      token_callback_function: (ids: bigint[]) => {
        tokens += ids.length;
      },
    });

    const sampling = temperature > 0;
    await generator(messages, {
      max_new_tokens: maxNewTokens,
      do_sample: sampling,
      ...(sampling ? { temperature, top_p: 0.9 } : {}),
      repetition_penalty: repetitionPenalty,
      streamer,
      stopping_criteria: stop,
    });

    post({
      type: 'complete',
      id,
      text,
      tokens,
      elapsedMs: Math.round(performance.now() - startedAt),
      interrupted: stop.interrupted,
    });
  } catch (error) {
    post({ type: 'error', phase: 'generate', id, message: describeError(error) });
  } finally {
    activeJob = null;
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  // Interrupts bypass the queue — they must reach a generation that is already running.
  if (request.type === 'interrupt') {
    if (activeJob?.id === request.id) activeJob.stop.interrupt();
    return;
  }

  queue = queue.then(() => {
    switch (request.type) {
      case 'check-cache':
        return handleCheckCache(request);
      case 'init':
        return handleInit(request);
      case 'generate':
        return handleGenerate(request);
    }
  });
});
