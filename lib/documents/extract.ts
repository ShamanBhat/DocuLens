/**
 * Browser-only: extracts page-anchored text from a PDF with PDF.js.
 * Import dynamically (`await import(...)`) — PDF.js requires browser APIs at module load.
 */
import { pdfjs } from 'react-pdf';
import type { PageText } from '@/lib/types';
import { PDF_DOCUMENT_OPTIONS, PDF_WORKER_SRC } from './pdfjs-config';

pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

function normalizeText(text: string): string {
  return text
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, totalPages: number) => void,
): Promise<{ pages: PageText[] }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ ...PDF_DOCUMENT_OPTIONS, data }).promise;

  try {
    const pages: PageText[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      let text = '';
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '');
      }

      pages.push({ page: pageNumber, text: normalizeText(text) });
      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
    }
    return { pages };
  } finally {
    void pdf.destroy();
  }
}

/** Maps PDF.js exceptions to a user-facing sentence fragment (appended to the file name). */
export function describePdfError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return 'is password-protected. Remove the password and try again.';
  if (name === 'InvalidPDFException') return 'is not a valid PDF or is corrupted.';
  return 'could not be read.';
}
