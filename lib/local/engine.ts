import { CLIENT_CONFIG } from '@/lib/config';
import {
  expectedDownloadBytes,
  pickRuntime,
  type LocalDevice,
  type LocalDtype,
  type LocalModelSpec,
} from './models';
import type { ChatMessage, WorkerRequest, WorkerResponse } from './protocol';
import { detectWebGpu } from './webgpu';

/**
 * Main-thread client for the on-device AI worker (`app/workers/ai.worker.ts`).
 *
 * A module-level singleton owns the worker, aggregates per-file download events into a single
 * progress model (bytes, %, speed, ETA), serialises generations, and exposes an immutable snapshot
 * for `useSyncExternalStore`. Nothing here imports Transformers.js — it only lives in the worker.
 */

export type EnginePhase = 'idle' | 'checking' | 'downloading' | 'compiling' | 'ready' | 'error';

export interface FileProgress {
  file: string;
  loaded: number;
  total: number;
  done: boolean;
}

export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number;
  /** 0–100 */
  percent: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
  files: FileProgress[];
}

export interface EngineSnapshot {
  phase: EnginePhase;
  model: LocalModelSpec | null;
  device: LocalDevice | null;
  dtype: LocalDtype | null;
  /** True when the weights were already in Cache Storage (no download needed). */
  fromCache: boolean;
  progress: DownloadProgress | null;
  error: string | null;
  /** Non-fatal message, e.g. "retrying on CPU after WebGPU failed". */
  notice: string | null;
  /** True while a generation is running or queued. */
  busy: boolean;
  tokensPerSecond: number | null;
}

export interface GenerateOptions {
  messages: ChatMessage[];
  maxNewTokens: number;
  /** 0 (default) = greedy decoding. */
  temperature?: number;
  repetitionPenalty?: number;
  onToken?: (delta: string, tokens: number) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  tokens: number;
  elapsedMs: number;
  interrupted: boolean;
}

/** The slice of the engine that analysis and chat code depend on. */
export interface TextEngine {
  generate(options: GenerateOptions): Promise<GenerateResult>;
}

export const IDLE_SNAPSHOT: EngineSnapshot = {
  phase: 'idle',
  model: null,
  device: null,
  dtype: null,
  fromCache: false,
  progress: null,
  error: null,
  notice: null,
  busy: false,
  tokensPerSecond: null,
};

interface Job {
  text: string;
  resolve: (result: GenerateResult) => void;
  reject: (error: Error) => void;
  onToken?: (delta: string, tokens: number) => void;
}

const EMIT_INTERVAL_MS = 120;
const SPEED_WINDOW_MS = 4_000;
const INTERRUPTED: GenerateResult = { text: '', tokens: 0, elapsedMs: 0, interrupted: true };

class LocalEngine implements TextEngine {
  private state: EngineSnapshot = IDLE_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  private worker: Worker | null = null;
  private loadTask: { key: string; promise: Promise<void> } | null = null;
  private loadRun = 0;
  private pendingInit: { resolve: () => void; reject: (error: Error) => void } | null = null;

  private readonly jobs = new Map<number, Job>();
  private nextJobId = 1;
  private activeJobId: number | null = null;
  private queued = 0;
  private chain: Promise<unknown> = Promise.resolve();

  private readonly files = new Map<string, FileProgress>();
  private samples: { t: number; bytes: number }[] = [];
  private expectedBytes = 0;
  private lastEmit = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): EngineSnapshot => this.state;

  private set(patch: Partial<EngineSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  /** Idempotent: resolves immediately when `model` is ready and joins an in-flight load. */
  load(model: LocalModelSpec): Promise<void> {
    if (this.state.phase === 'ready' && this.state.model?.key === model.key) return Promise.resolve();
    if (this.loadTask?.key === model.key) return this.loadTask.promise;

    const task = { key: model.key, promise: this.startLoad(model) };
    this.loadTask = task;
    // After a failure the next call must retry instead of re-joining the rejected promise.
    task.promise.catch(() => {
      if (this.loadTask === task) this.loadTask = null;
    });
    return task.promise;
  }

  /** Aborts any download/generation and frees the worker (and its GPU memory). */
  unload(): void {
    this.loadRun += 1;
    this.loadTask = null;
    this.terminate(new Error('The on-device model was unloaded.'));
    this.set({ ...IDLE_SNAPSHOT });
  }

  private async startLoad(model: LocalModelSpec): Promise<void> {
    const run = ++this.loadRun;
    this.terminate(new Error('Superseded by another model load.'));

    const support = await detectWebGpu();
    let runtime = pickRuntime(support);

    this.set({
      ...IDLE_SNAPSHOT,
      phase: 'checking',
      model,
      device: runtime.device,
      dtype: runtime.dtype,
      notice: support.supported ? null : support.reason,
    });

    try {
      try {
        await this.initWorker(model, runtime);
      } catch (error) {
        if (run !== this.loadRun || runtime.device !== 'webgpu') throw error;

        // A broken GPU stack should not strand the user: retry on the CPU backend.
        const reason = error instanceof Error ? error.message : 'unknown error';
        runtime = { device: 'wasm', dtype: 'q8' };
        this.terminate(new Error('Retrying on CPU.'));
        this.set({
          ...IDLE_SNAPSHOT,
          phase: 'checking',
          model,
          device: runtime.device,
          dtype: runtime.dtype,
          notice: `WebGPU failed to initialise (${reason}). Retrying on the CPU — this is much slower.`,
        });
        await this.initWorker(model, runtime);
      }
    } catch (error) {
      if (run !== this.loadRun) throw error; // superseded: the newer load owns the state
      const message = error instanceof Error ? error.message : 'The on-device model failed to load.';
      this.terminate(new Error(message));
      this.set({ phase: 'error', error: message, progress: null });
      throw new Error(message);
    }
  }

  private initWorker(model: LocalModelSpec, runtime: { device: LocalDevice; dtype: LocalDtype }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.files.clear();
      this.samples = [];
      this.expectedBytes = expectedDownloadBytes(model, runtime.dtype);
      this.pendingInit = { resolve, reject };

      this.spawn();
      this.send({ type: 'check-cache', modelId: model.repoId, dtype: runtime.dtype, device: runtime.device });
      this.send({
        type: 'init',
        modelId: model.repoId,
        dtype: runtime.dtype,
        device: runtime.device,
        remoteHost: CLIENT_CONFIG.hfRemoteHost,
        wasmPaths: CLIENT_CONFIG.ortWasmPath,
      });
    });
  }

  private spawn(): void {
    // The URL must stay an inline literal so the bundler emits the worker as its own chunk.
    const worker = new Worker(new URL('../../app/workers/ai.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => this.onMessage(event.data));
    worker.addEventListener('error', (event) => this.onCrash(event.message || 'The on-device AI worker crashed.'));
    this.worker = worker;
  }

  private send(request: WorkerRequest): void {
    this.worker?.postMessage(request);
  }

  private terminate(reason: Error): void {
    this.worker?.terminate();
    this.worker = null;

    const init = this.pendingInit;
    this.pendingInit = null;
    init?.reject(reason);

    for (const job of this.jobs.values()) job.reject(reason);
    this.jobs.clear();
    this.activeJobId = null;
  }

  private onCrash(message: string): void {
    const wasReady = this.state.phase === 'ready';
    this.terminate(new Error(message));
    if (wasReady) {
      this.loadTask = null; // let the next load() start a fresh worker
      this.set({ phase: 'error', error: message, busy: false });
    }
  }

  // ── Worker events ──────────────────────────────────────────────────────────

  private onMessage(message: WorkerResponse): void {
    switch (message.type) {
      case 'cache':
        // A cache hit skips straight to GPU/session creation; a miss means bytes are coming.
        this.set(message.cached ? { fromCache: true, phase: 'compiling' } : { fromCache: false, phase: 'downloading' });
        break;

      case 'file':
        this.onFile(message);
        break;

      case 'ready': {
        const init = this.pendingInit;
        this.pendingInit = null;
        const total = Math.max(this.sumTotal(), this.expectedBytes);
        this.set({
          phase: 'ready',
          device: message.device,
          dtype: message.dtype,
          error: null,
          progress: this.state.fromCache ? null : this.buildProgress(total, total),
        });
        if (!this.state.fromCache) void navigator.storage?.persist?.().catch(() => undefined);
        init?.resolve();
        break;
      }

      case 'token': {
        const job = this.jobs.get(message.id);
        if (!job) break;
        job.text += message.text;
        job.onToken?.(message.text, message.tokens);
        break;
      }

      case 'complete': {
        const job = this.jobs.get(message.id);
        if (!job) break;
        this.jobs.delete(message.id);
        if (message.tokens >= 8 && message.elapsedMs > 0) {
          this.set({ tokensPerSecond: Math.round((message.tokens / message.elapsedMs) * 10_000) / 10 });
        }
        job.resolve({
          text: message.text,
          tokens: message.tokens,
          elapsedMs: message.elapsedMs,
          interrupted: message.interrupted,
        });
        break;
      }

      case 'error': {
        const error = new Error(message.message);
        if (message.phase === 'init') {
          const init = this.pendingInit;
          this.pendingInit = null;
          init?.reject(error);
        } else if (message.id !== undefined) {
          const job = this.jobs.get(message.id);
          this.jobs.delete(message.id);
          job?.reject(error);
        }
        break;
      }
    }
  }

  private onFile(message: Extract<WorkerResponse, { type: 'file' }>): void {
    const previous = this.files.get(message.file);
    const entry: FileProgress = {
      file: message.file,
      loaded: Math.max(message.loaded, previous?.loaded ?? 0),
      total: Math.max(message.total, previous?.total ?? 0),
      done: message.status === 'done',
    };
    this.files.set(message.file, entry);

    // Cached loads still emit file events; they must not flip the phase back to "downloading".
    if (this.state.fromCache) return;

    const now = performance.now();
    if (message.status !== 'done' && now - this.lastEmit < EMIT_INTERVAL_MS) return;
    this.lastEmit = now;

    const loaded = this.sumLoaded();
    const total = Math.max(this.sumTotal(), this.expectedBytes);
    const allDone = [...this.files.values()].every((file) => file.done);
    const phase: EnginePhase = allDone && loaded >= total * 0.98 ? 'compiling' : 'downloading';

    this.set({ phase, progress: this.buildProgress(loaded, total) });
  }

  private sumLoaded(): number {
    let sum = 0;
    for (const file of this.files.values()) sum += file.loaded;
    return sum;
  }

  private sumTotal(): number {
    let sum = 0;
    for (const file of this.files.values()) sum += file.total;
    return sum;
  }

  private buildProgress(loaded: number, total: number): DownloadProgress {
    const now = performance.now();
    this.samples.push({ t: now, bytes: loaded });
    this.samples = this.samples.filter((sample) => now - sample.t <= SPEED_WINDOW_MS);

    const first = this.samples[0];
    const span = now - first.t;
    const bytesPerSecond = span >= 500 ? Math.max(0, ((loaded - first.bytes) / span) * 1000) : 0;
    const remaining = Math.max(0, total - loaded);

    return {
      loadedBytes: loaded,
      totalBytes: total,
      percent: total > 0 ? Math.min(100, (loaded / total) * 100) : 0,
      bytesPerSecond,
      etaSeconds: bytesPerSecond > 1024 && remaining > 0 ? remaining / bytesPerSecond : null,
      files: [...this.files.values()].sort((a, b) => b.total - a.total),
    };
  }

  // ── Generation ─────────────────────────────────────────────────────────────

  /** Serialised: concurrent callers (audit + chat) are queued behind the running generation. */
  generate(options: GenerateOptions): Promise<GenerateResult> {
    this.queued += 1;
    this.set({ busy: true });

    const run = this.chain.then(() => this.runGeneration(options));
    this.chain = run.catch(() => undefined);

    return run.finally(() => {
      this.queued -= 1;
      if (this.queued === 0) this.set({ busy: false });
    });
  }

  /** Stops the running generation (queued ones are untouched). */
  interrupt(): void {
    if (this.activeJobId !== null) this.send({ type: 'interrupt', id: this.activeJobId });
  }

  private async runGeneration(options: GenerateOptions): Promise<GenerateResult> {
    if (options.signal?.aborted) return INTERRUPTED;

    if (!this.loadTask) throw new Error('The on-device model has not been loaded yet.');
    await this.loadTask.promise;
    if (options.signal?.aborted) return INTERRUPTED;

    const worker = this.worker;
    if (!worker || this.state.phase !== 'ready') throw new Error('The on-device model is not ready.');

    const id = this.nextJobId++;

    return new Promise<GenerateResult>((resolve, reject) => {
      const stop = () => this.send({ type: 'interrupt', id });
      const cleanup = () => {
        options.signal?.removeEventListener('abort', stop);
        if (this.activeJobId === id) this.activeJobId = null;
      };

      this.jobs.set(id, {
        text: '',
        onToken: options.onToken,
        resolve: (result) => {
          cleanup();
          resolve(result);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });
      this.activeJobId = id;
      options.signal?.addEventListener('abort', stop, { once: true });

      worker.postMessage({
        type: 'generate',
        id,
        messages: options.messages,
        maxNewTokens: options.maxNewTokens,
        temperature: options.temperature ?? 0,
        repetitionPenalty: options.repetitionPenalty ?? 1.05,
      } satisfies WorkerRequest);

      if (options.signal?.aborted) stop();
    });
  }
}

let instance: LocalEngine | null = null;

/** Browser-only singleton (constructing it does not start a worker). */
export function getLocalEngine(): LocalEngine {
  instance ??= new LocalEngine();
  return instance;
}

export type { LocalEngine };

export const subscribeEngine = (listener: () => void): (() => void) => getLocalEngine().subscribe(listener);
export const getEngineSnapshot = (): EngineSnapshot => getLocalEngine().getSnapshot();
