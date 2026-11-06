'use client';

import { LoaderCircle, Plus, TriangleAlert, X } from 'lucide-react';
import { useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import type { IngestProgress } from '@/hooks/use-document-bundle';
import type { LoadedDocument } from '@/lib/types';
import { cn, formatTokens } from '@/lib/utils';

interface DocumentTabsProps {
  documents: LoadedDocument[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: File[]) => Promise<void>;
  ingest: IngestProgress | null;
}

export function DocumentTabs({ documents, activeId, onSelect, onRemove, onAddFiles, ingest }: DocumentTabsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) void onAddFiles(files);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <div className="flex items-center gap-1 border-b border-white/5 px-2 py-2">
      <div role="tablist" aria-label="Documents in bundle" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {documents.map((doc) => {
          const active = doc.id === activeId;
          return (
            <div
              key={doc.id}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              onClick={() => onSelect(doc.id)}
              onKeyDown={(event) => onTabKeyDown(event, doc.id)}
              title={`${doc.name} · ${doc.pageCount} pages · ≈${formatTokens(doc.tokenEstimate)} tokens`}
              className={cn(
                'group flex max-w-60 shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition',
                active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              <span className="rounded bg-indigo-500/20 px-1 font-mono text-[10px] text-indigo-200">{doc.id}</span>
              <span className="truncate">{doc.name}</span>
              {!doc.hasTextLayer && (
                <TriangleAlert className="size-3.5 shrink-0 text-amber-400" aria-label="Little or no extractable text" />
              )}
              <span className="shrink-0 text-[10px] text-slate-500">{doc.pageCount}p</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(doc.id);
                }}
                aria-label={`Remove ${doc.name}`}
                className="rounded p-0.5 text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-slate-200 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ingest !== null}
        title="Add documents to the bundle"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/5 disabled:opacity-60"
      >
        {ingest ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        <span className="hidden tabular-nums sm:inline">
          {ingest ? `${ingest.page}/${ingest.totalPages || '…'}` : 'Add'}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        tabIndex={-1}
        className="sr-only"
        onChange={onInputChange}
      />
    </div>
  );
}
