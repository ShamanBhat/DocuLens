'use client';

import { FileText } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { useCitationNavigator } from './citation-context';

/** Accepts fully-formed or partially streamed citations. */
export interface CitationLike {
  documentId?: string;
  page?: number;
  section?: string | null;
  quote?: string | null;
}

export function CitationChip({ citation }: { citation: CitationLike }) {
  const { navigate, documentName } = useCitationNavigator();
  const { documentId, page, section, quote } = citation;
  if (!documentId || typeof page !== 'number') return null;

  const pageNumber = Math.round(page);
  const name = documentName(documentId);
  const title = [
    name ?? `${documentId} (not in this bundle)`,
    `page ${pageNumber}`,
    section,
    quote ? `“${quote}”` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      title={title}
      onClick={() => navigate({ documentId, page: pageNumber, quote: quote ?? null })}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline font-mono text-[11px] leading-none transition',
        name
          ? 'border-indigo-400/25 bg-indigo-400/10 text-indigo-200 hover:border-indigo-300/50 hover:bg-indigo-400/20'
          : 'border-white/10 text-slate-500',
      )}
    >
      <FileText className="size-3 shrink-0" />
      <span className="truncate">
        {documentId} · p.{pageNumber}
        {section ? ` · ${section}` : ''}
      </span>
    </button>
  );
}

export function CitationList({
  citations,
  connector,
  className,
}: {
  citations: CitationLike[];
  /** Rendered between chips, e.g. "↔" for conflicting clauses. */
  connector?: string;
  className?: string;
}) {
  const valid = citations.filter((c) => c.documentId && typeof c.page === 'number');
  if (valid.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {valid.map((citation, index) => (
        <Fragment key={`${citation.documentId}-${citation.page}-${index}`}>
          {connector && index > 0 && (
            <span className="text-xs text-slate-500" aria-hidden>
              {connector}
            </span>
          )}
          <CitationChip citation={citation} />
        </Fragment>
      ))}
    </div>
  );
}
