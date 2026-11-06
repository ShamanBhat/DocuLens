import type { UIMessage } from 'ai';
import type { ModelKey, ModelOption } from '@/lib/ai/models';
import type { Analysis } from '@/lib/ai/schemas';

export interface PageText {
  /** 1-based page number — the anchor used for every citation. */
  page: number;
  text: string;
}

/** Wire format sent to the API: extracted, page-anchored text only (never the binary PDF). */
export interface DocumentPayload {
  /** Short, stable id used in prompts and citations, e.g. "D1". */
  id: string;
  name: string;
  pages: PageText[];
}

/** Client-side document: payload + the original file for rendering. */
export interface LoadedDocument extends DocumentPayload {
  file: File;
  pageCount: number;
  tokenEstimate: number;
  /** False when the PDF looks scanned (little or no extractable text). */
  hasTextLayer: boolean;
}

export interface CitationTarget {
  documentId: string;
  page: number;
  /** Verbatim quote to highlight in the viewer, when available. */
  quote?: string | null;
}

export interface ModelsResponse {
  models: ModelOption[];
  defaultModelKey: ModelKey | null;
}

/** Per-message metadata streamed from /api/chat — shows which model produced each answer. */
export interface ChatMetadata {
  model: string;
  modelKey: string;
  totalTokens?: number;
}

export type DocuLensUIMessage = UIMessage<ChatMetadata>;

/** Recursive partial matching the shape of objects streamed by `useObject`. */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? Array<DeepPartial<U> | undefined>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type PartialAnalysis = DeepPartial<Analysis>;
