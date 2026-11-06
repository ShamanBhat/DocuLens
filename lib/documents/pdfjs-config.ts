/**
 * PDF.js runtime configuration. Assets are copied to /public/pdfjs on install
 * (scripts/copy-pdfjs-assets.mjs) so the worker version always matches react-pdf.
 * This module has no browser dependencies and is safe to import anywhere.
 */
export const PDF_WORKER_SRC = '/pdfjs/pdf.worker.min.mjs';

/** Shared by the viewer and the text extractor. Keep as a module constant (react-pdf compares by reference). */
export const PDF_DOCUMENT_OPTIONS = {
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  // Defense-in-depth against malicious font programs in untrusted PDFs.
  isEvalSupported: false,
};
