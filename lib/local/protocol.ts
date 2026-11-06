import type { LocalDevice, LocalDtype } from './models';

/** Messages exchanged between the UI thread and `app/workers/ai.worker.ts`. */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type WorkerRequest =
  | { type: 'check-cache'; modelId: string; dtype: LocalDtype; device: LocalDevice }
  | {
      type: 'init';
      modelId: string;
      dtype: LocalDtype;
      device: LocalDevice;
      remoteHost: string;
      /** Directory serving the ONNX Runtime .wasm files; `null` keeps the library default. */
      wasmPaths: string | null;
    }
  | {
      type: 'generate';
      id: number;
      messages: ChatMessage[];
      maxNewTokens: number;
      /** 0 selects greedy decoding. */
      temperature: number;
      repetitionPenalty: number;
    }
  | { type: 'interrupt'; id: number };

export type WorkerResponse =
  | { type: 'cache'; cached: boolean }
  | { type: 'file'; file: string; status: 'start' | 'progress' | 'done'; loaded: number; total: number }
  | { type: 'ready'; device: LocalDevice; dtype: LocalDtype; loadMs: number }
  | { type: 'token'; id: number; text: string; tokens: number }
  | { type: 'complete'; id: number; text: string; tokens: number; elapsedMs: number; interrupted: boolean }
  | { type: 'error'; phase: 'init' | 'generate'; id?: number; message: string };
