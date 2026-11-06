import { APPROX_CHARS_PER_TOKEN } from '@/lib/documents/context';
import type { DocumentPayload, PageText } from '@/lib/types';

/**
 * A "window" is the slice of one document that fits a small model's per-pass budget. Windows
 * never cross document boundaries, so every finding can be attributed to a single document id.
 */
export interface AnalysisWindow {
  index: number;
  documentId: string;
  documentName: string;
  startPage: number;
  endPage: number;
  pages: PageText[];
}

/** Upper bound on passes so a 1,000-page upload can't queue hours of local inference. */
export const MAX_LOCAL_WINDOWS = 120;

/** Characters reserved per page for the surrounding <page> tags. */
const PAGE_TAG_OVERHEAD = 40;

function splitOversized(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const parts: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + maxChars);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
      if (boundary > cursor + maxChars / 2) end = boundary;
    }
    parts.push(text.slice(cursor, end).trim());
    cursor = end;
  }
  return parts.filter(Boolean);
}

export function buildWindows(
  documents: DocumentPayload[],
  budgetTokens: number,
): { windows: AnalysisWindow[]; truncated: boolean } {
  const maxChars = budgetTokens * APPROX_CHARS_PER_TOKEN;
  const windows: AnalysisWindow[] = [];

  for (const doc of documents) {
    let current: PageText[] = [];
    let size = 0;

    const flush = () => {
      if (current.length === 0) return;
      windows.push({
        index: windows.length,
        documentId: doc.id,
        documentName: doc.name,
        startPage: current[0].page,
        endPage: current[current.length - 1].page,
        pages: current,
      });
      current = [];
      size = 0;
    };

    for (const page of doc.pages) {
      const text = page.text.trim();
      if (!text) continue;

      for (const part of splitOversized(text, maxChars)) {
        const cost = part.length + PAGE_TAG_OVERHEAD;
        if (size + cost > maxChars) flush();
        current.push({ page: page.page, text: part });
        size += cost;
      }
    }
    flush();
  }

  return { windows: windows.slice(0, MAX_LOCAL_WINDOWS), truncated: windows.length > MAX_LOCAL_WINDOWS };
}

export function formatPageRange(window: Pick<AnalysisWindow, 'documentId' | 'startPage' | 'endPage'>): string {
  return window.startPage === window.endPage
    ? `${window.documentId} p.${window.startPage}`
    : `${window.documentId} p.${window.startPage}–${window.endPage}`;
}
