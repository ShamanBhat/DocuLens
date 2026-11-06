import type { CitationTarget } from '@/lib/types';

/**
 * Chat answers cite sources inline as `[D1 p.12]` or `[D1 p.12 §4.2]` (see prompts.ts).
 * These helpers turn them into `#cite-…` Markdown links that the renderer swaps for
 * clickable citation chips.
 */

/** A bracketed group not already followed by `(` (i.e. not a Markdown link). */
const BRACKET_GROUP = /\[([^[\]\n]{2,160})\](?!\()/g;

/** One reference inside a group: "D1 p.12", "D1, p. 12–13", "D2 page 7 §4.2(b)". */
const SINGLE_REFERENCE = /^\s*(D\d{1,3})[\s,]+(?:pp?\.?|pages?)\s*(\d{1,5})(?:\s*[-–]\s*\d{1,5})?(?:[\s,]+(.+?))?\s*$/i;

const CITATION_HREF = /^#cite-(D\d{1,3})-(\d{1,5})(?:-(.+))?$/;

export interface InlineCitation extends CitationTarget {
  section: string | null;
}

function encodeSection(section: string): string {
  // encodeURIComponent leaves parentheses intact, which would break Markdown link syntax.
  return encodeURIComponent(section).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function linkifyCitations(markdown: string): string {
  return markdown.replace(BRACKET_GROUP, (match, inner: string) => {
    const links: string[] = [];
    for (const part of inner.split(';')) {
      const ref = SINGLE_REFERENCE.exec(part);
      if (!ref) return match;
      const [, rawId, page, section] = ref;
      const documentId = rawId.toUpperCase();
      const suffix = section?.trim() ? `-${encodeSection(section.trim())}` : '';
      links.push(`[${documentId} p.${page}](#cite-${documentId}-${page}${suffix})`);
    }
    return links.join(' ');
  });
}

export function parseCitationHref(href: string | undefined): InlineCitation | null {
  const match = href ? CITATION_HREF.exec(href) : null;
  if (!match) return null;

  let section: string | null = null;
  if (match[3]) {
    try {
      section = decodeURIComponent(match[3]);
    } catch {
      section = null;
    }
  }
  return { documentId: match[1], page: Number(match[2]), section, quote: null };
}
