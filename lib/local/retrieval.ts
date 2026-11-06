import type { DocumentPayload } from '@/lib/types';

/**
 * Lightweight lexical retrieval (BM25) for on-device chat. Small models can't hold a whole bundle,
 * so each question gets the most relevant pages — no embeddings, no extra model download, and it
 * runs in a few milliseconds even for thousands of pages.
 */

const STOP_WORDS = new Set(
  (
    'a an the and or but if then than that this these those of to in on at by for with from as is are was were be been being ' +
    'it its they them their there here what which who whom whose when where why how can could should would may might shall will do does did ' +
    'has have had not no yes any all each per about into over under between within without also such other more most some please tell me list show ' +
    'document documents contract agreement page pages'
  ).split(' '),
);

const K1 = 1.4;
const B = 0.75;
const PAGE_TAG_OVERHEAD = 40;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

interface IndexedPage {
  documentIndex: number;
  documentId: string;
  documentName: string;
  page: number;
  text: string;
  terms: Map<string, number>;
  length: number;
}

export interface RetrievalResult {
  documents: DocumentPayload[];
  pagesUsed: number;
  totalPages: number;
  strategy: 'search' | 'lead';
}

/**
 * Picks the pages most relevant to `query` that fit in `budgetChars`, in reading order.
 * Falls back to the opening pages of each document when the query has no usable terms.
 */
export function selectRelevantPages(documents: DocumentPayload[], query: string, budgetChars: number): RetrievalResult {
  const pages: IndexedPage[] = [];
  documents.forEach((doc, documentIndex) => {
    for (const page of doc.pages) {
      const text = page.text.trim();
      if (!text) continue;
      const tokens = tokenize(text);
      const terms = new Map<string, number>();
      for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1);
      pages.push({ documentIndex, documentId: doc.id, documentName: doc.name, page: page.page, text, terms, length: tokens.length });
    }
  });

  const totalPages = pages.length;
  const queryTerms = [...new Set(tokenize(query))];

  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, pages.reduce((count, page) => count + (page.terms.has(term) ? 1 : 0), 0));
  }
  const averageLength = pages.reduce((sum, page) => sum + page.length, 0) / Math.max(1, totalPages);

  const scored = pages.map((page) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = page.terms.get(term) ?? 0;
      if (frequency === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (totalPages - df + 0.5) / (df + 0.5));
      score += (idf * (frequency * (K1 + 1))) / (frequency + K1 * (1 - B + (B * page.length) / Math.max(1, averageLength)));
    }
    return { page, score };
  });

  const hasSignal = scored.some((entry) => entry.score > 0);
  const strategy: RetrievalResult['strategy'] = hasSignal ? 'search' : 'lead';

  // Search: best score first. Lead: round-robin through documents from their first page.
  const ordered = hasSignal
    ? scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).map((entry) => entry.page)
    : [...pages].sort((a, b) => a.page - b.page || a.documentIndex - b.documentIndex);

  const perPageCap = Math.max(1_500, Math.floor(budgetChars / 2));
  const chosen: { page: IndexedPage; text: string }[] = [];
  let used = 0;

  for (const page of ordered) {
    const text = page.text.length > perPageCap ? `${page.text.slice(0, perPageCap)}…` : page.text;
    const cost = text.length + PAGE_TAG_OVERHEAD;
    if (used + cost > budgetChars) continue; // a smaller page further down may still fit
    chosen.push({ page, text });
    used += cost;
  }

  if (chosen.length === 0 && ordered.length > 0) {
    chosen.push({ page: ordered[0], text: ordered[0].text.slice(0, Math.max(500, budgetChars - PAGE_TAG_OVERHEAD)) });
  }

  // Reading order, grouped back into documents.
  chosen.sort((a, b) => a.page.documentIndex - b.page.documentIndex || a.page.page - b.page.page);
  const grouped = new Map<number, DocumentPayload>();
  for (const { page, text } of chosen) {
    const doc = grouped.get(page.documentIndex) ?? { id: page.documentId, name: page.documentName, pages: [] };
    doc.pages.push({ page: page.page, text });
    grouped.set(page.documentIndex, doc);
  }

  return { documents: [...grouped.values()], pagesUsed: chosen.length, totalPages, strategy };
}
