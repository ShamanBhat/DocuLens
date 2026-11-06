import type { DocumentPayload, LoadedDocument } from '@/lib/types';

/** Provider-agnostic heuristic (~4 characters per token for English prose). */
export const APPROX_CHARS_PER_TOKEN = 4;

/** Headroom reserved for system prompt + envelope tags. */
export const PROMPT_OVERHEAD_TOKENS = 2_500;

/** Smallest completion budget worth sending a request for. */
export const MIN_OUTPUT_TOKENS = 4_096;

export function estimateTokens(characters: number): number {
  return Math.ceil(characters / APPROX_CHARS_PER_TOKEN);
}

export function countCharacters(documents: DocumentPayload[]): number {
  return documents.reduce(
    (total, doc) => total + doc.pages.reduce((sum, page) => sum + page.text.length, 0),
    0,
  );
}

export function fitsInContext(bundleTokens: number, contextWindow: number): boolean {
  return bundleTokens + PROMPT_OVERHEAD_TOKENS + MIN_OUTPUT_TOKENS <= contextWindow;
}

/** Strips client-only fields (the File object) before sending to the API. */
export function toDocumentPayload(documents: LoadedDocument[]): DocumentPayload[] {
  return documents.map(({ id, name, pages }) => ({ id, name, pages }));
}

// Prompt-injection hardening: document text must not be able to close or forge our envelope tags.
const ENVELOPE_TAG = /<\s*\/?\s*(?:documents?|page)\b[^>]*>/gi;

function neutralizeEnvelopeTags(text: string): string {
  return text.replace(ENVELOPE_TAG, (tag) => tag.replace(/</g, '‹').replace(/>/g, '›'));
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Serializes the bundle into a page-anchored envelope:
 *
 *   <document id="D1" name="MSA.pdf" total_pages="42">
 *   <page number="1"> … </page>
 *   </document>
 *
 * Explicit page tags let any model cite exact pages, independent of printed page labels.
 */
export function serializeDocuments(documents: DocumentPayload[]): string {
  return documents
    .map((doc) => {
      const pages = doc.pages
        .map((page) => {
          const text = neutralizeEnvelopeTags(page.text.trim()) || '[no extractable text on this page]';
          return `<page number="${page.page}">\n${text}\n</page>`;
        })
        .join('\n');
      return `<document id="${doc.id}" name="${escapeAttribute(doc.name)}" total_pages="${doc.pages.length}">\n${pages}\n</document>`;
    })
    .join('\n\n');
}
