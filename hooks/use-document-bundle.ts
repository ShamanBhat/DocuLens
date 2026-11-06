'use client';

import { useCallback, useRef, useState } from 'react';
import { MAX_DOCUMENTS, MAX_FILE_SIZE_BYTES, MIN_CHARS_PER_PAGE } from '@/lib/constants';
import { estimateTokens } from '@/lib/documents/context';
import type { LoadedDocument } from '@/lib/types';
import { formatBytes } from '@/lib/utils';

export interface IngestProgress {
  fileName: string;
  fileIndex: number;
  fileCount: number;
  page: number;
  totalPages: number;
}

export interface AddFilesResult {
  added: LoadedDocument[];
  issues: string[];
}

const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/**
 * Owns the document bundle. PDFs are parsed entirely in the browser — the server only
 * ever receives extracted, page-anchored text.
 *
 * `version` changes whenever the bundle changes; consumers key analysis/chat state on it.
 */
export function useDocumentBundle() {
  const [documents, setDocuments] = useState<LoadedDocument[]>([]);
  const [version, setVersion] = useState(0);
  const [ingest, setIngest] = useState<IngestProgress | null>(null);
  const nextId = useRef(1);

  const addFiles = useCallback(
    async (files: File[]): Promise<AddFilesResult> => {
      const issues: string[] = [];

      const candidates = files.filter((file) => {
        if (!isPdf(file)) {
          issues.push(`“${file.name}” is not a PDF.`);
          return false;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          issues.push(`“${file.name}” exceeds the ${formatBytes(MAX_FILE_SIZE_BYTES)} limit.`);
          return false;
        }
        return true;
      });

      const accepted = candidates.slice(0, Math.max(0, MAX_DOCUMENTS - documents.length));
      if (accepted.length < candidates.length) {
        issues.push(`A bundle can contain at most ${MAX_DOCUMENTS} documents.`);
      }
      if (accepted.length === 0) return { added: [], issues };

      // PDF.js touches browser-only globals at import time, so load it on demand.
      const { extractPdfText, describePdfError } = await import('@/lib/documents/extract');
      const added: LoadedDocument[] = [];

      for (const [fileIndex, file] of accepted.entries()) {
        setIngest({ fileName: file.name, fileIndex, fileCount: accepted.length, page: 0, totalPages: 0 });
        try {
          const { pages } = await extractPdfText(file, (page, totalPages) =>
            setIngest((prev) => (prev ? { ...prev, page, totalPages } : prev)),
          );
          const characters = pages.reduce((sum, page) => sum + page.text.length, 0);
          added.push({
            id: `D${nextId.current++}`,
            name: file.name,
            file,
            pages,
            pageCount: pages.length,
            tokenEstimate: estimateTokens(characters),
            hasTextLayer: characters >= pages.length * MIN_CHARS_PER_PAGE,
          });
        } catch (error) {
          issues.push(`“${file.name}” ${describePdfError(error)}`);
        }
      }

      setIngest(null);
      if (added.length > 0) {
        setDocuments((prev) => [...prev, ...added]);
        setVersion((v) => v + 1);
      }
      return { added, issues };
    },
    [documents.length],
  );

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    setVersion((v) => v + 1);
  }, []);

  const reset = useCallback(() => {
    setDocuments([]);
    setVersion((v) => v + 1);
    nextId.current = 1;
  }, []);

  return { documents, version, ingest, addFiles, removeDocument, reset };
}
