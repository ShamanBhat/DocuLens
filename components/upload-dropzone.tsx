'use client';

import { motion } from 'framer-motion';
import { FileText, LoaderCircle, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { IngestProgress } from '@/hooks/use-document-bundle';
import { MAX_DOCUMENTS, MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import { cn, formatBytes } from '@/lib/utils';

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  ingest: IngestProgress | null;
}

export function UploadDropzone({ onFiles, ingest }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const busy = ingest !== null;

  // Depth counter avoids flicker when dragging over child elements.
  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (busy) return;
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };
  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) onFiles(files);
  };

  const percent = ingest && ingest.totalPages > 0 ? Math.round((ingest.page / ingest.totalPages) * 100) : 0;

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'relative overflow-hidden rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors',
        dragging
          ? 'border-indigo-400/70 bg-indigo-500/10'
          : 'border-white/10 bg-slate-900/40 hover:border-white/20',
      )}
    >
      <motion.div animate={{ scale: dragging ? 1.02 : 1 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
        {ingest ? (
          <div className="space-y-4" role="status" aria-live="polite">
            <LoaderCircle className="mx-auto size-8 animate-spin text-indigo-300" />
            <div>
              <p className="truncate text-sm font-medium text-slate-200">Extracting text · {ingest.fileName}</p>
              <p className="mt-1 text-xs text-slate-500">
                File {ingest.fileIndex + 1} of {ingest.fileCount} · page {ingest.page} of {ingest.totalPages || '…'}
              </p>
            </div>
            <div className="mx-auto h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-linear-to-r from-indigo-400 to-cyan-300"
                animate={{ width: `${percent}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-linear-to-br from-indigo-500/25 to-cyan-400/20 ring-1 ring-white/10">
              <Upload className="size-6 text-indigo-200" />
            </div>
            <p className="mt-5 text-base font-medium text-slate-100">
              {dragging ? 'Release to start the audit' : 'Drop contracts, MSAs, SOWs or an entire deal bundle'}
            </p>
            <p className="mt-1.5 text-sm text-slate-400">Multi-file bundles are cross-referenced as one corpus.</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-50"
            >
              <FileText className="size-4" />
              Select PDFs
            </button>
            <p className="mt-4 text-xs text-slate-500">
              PDF · up to {formatBytes(MAX_FILE_SIZE_BYTES)} each · up to {MAX_DOCUMENTS} documents
            </p>
          </>
        )}
      </motion.div>

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
