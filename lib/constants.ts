export const APP_NAME = 'DocuLens';

export const TAGLINE =
  'Enterprise long-context document analysis and risk auditing running 100% locally in your browser using WebGPU & Hugging Face.';

/** Maximum number of documents in one audit bundle (enforced client- and server-side). */
export const MAX_DOCUMENTS = 20;

/** Per-file upload limit. Parsing happens in the browser, so this protects tab memory. */
export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

/** Below this many extracted characters per page a PDF is treated as scanned / image-only. */
export const MIN_CHARS_PER_PAGE = 25;

export const MODEL_STORAGE_KEY = 'doculens:model';
