'use client';

/**
 * Split-screen PDF viewer (react-pdf / PDF.js). Renders one page at a time so even
 * thousand-page documents stay responsive, and highlights cited quotes in the text layer.
 * Load with `next/dynamic` and `ssr: false` — PDF.js needs browser APIs.
 */
import { ChevronLeft, ChevronRight, LoaderCircle, TriangleAlert, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import { PDF_DOCUMENT_OPTIONS, PDF_WORKER_SRC } from '@/lib/documents/pdfjs-config';
import { cn } from '@/lib/utils';

// Must be set in the module that renders <Document>, otherwise react-pdf's default may win.
pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
const DEFAULT_ZOOM_INDEX = 2;

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * customTextRenderer output is injected as HTML, so PDF text is always escaped first.
 * Text items that are part of the cited quote (or contain it) are wrapped in <mark>.
 */
function renderTextItem(text: string, normalizedQuote: string): string {
  const safe = escapeHtml(text);
  if (!normalizedQuote) return safe;
  const item = normalizeForMatch(text);
  const matches =
    item.length >= 8
      ? normalizedQuote.includes(item) || item.includes(normalizedQuote)
      : item.length > 0 && item === normalizedQuote;
  return matches ? `<mark class="doculens-hl">${safe}</mark>` : safe;
}

export interface PdfViewerProps {
  file: File;
  pageCount: number;
  page: number;
  onPageChange: (page: number) => void;
  /** Verbatim quote to highlight on the current page (set when a citation is clicked). */
  highlight: string | null;
}

export default function PdfViewer({ file, pageCount, page, onPageChange, highlight }: PdfViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const zoom = ZOOM_STEPS[zoomIndex];

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback(
    (target: number) => {
      if (!Number.isFinite(target)) return;
      onPageChange(Math.min(Math.max(1, Math.round(target)), pageCount));
    },
    [onPageChange, pageCount],
  );

  const normalizedQuote = useMemo(() => (highlight ? normalizeForMatch(highlight) : ''), [highlight]);
  const textRenderer = useCallback(
    ({ str }: { str: string }) => renderTextItem(str, normalizedQuote),
    [normalizedQuote],
  );
  const scrollToHighlight = useCallback(() => {
    viewportRef.current?.querySelector('mark.doculens-hl')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(page + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(page - 1);
    }
  };

  const onPageSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goTo(Number(new FormData(event.currentTarget).get('page')));
  };

  // Subtract the viewport padding so the page fits at 100%.
  const pageWidth = width > 0 ? Math.floor((width - 32) * zoom) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-1.5 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <ToolbarButton label="Previous page" onClick={() => goTo(page - 1)} disabled={page <= 1}>
            <ChevronLeft className="size-4" />
          </ToolbarButton>
          <form onSubmit={onPageSubmit} className="flex items-center gap-1.5">
            <input
              key={page}
              name="page"
              defaultValue={page}
              inputMode="numeric"
              aria-label="Page number"
              onBlur={(event) => event.currentTarget.form?.requestSubmit()}
              className="w-12 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-center tabular-nums text-slate-200 outline-none focus:border-indigo-400/60"
            />
            <span className="tabular-nums">/ {pageCount}</span>
          </form>
          <ToolbarButton label="Next page" onClick={() => goTo(page + 1)} disabled={page >= pageCount}>
            <ChevronRight className="size-4" />
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-1">
          <ToolbarButton label="Zoom out" onClick={() => setZoomIndex((i) => Math.max(0, i - 1))} disabled={zoomIndex === 0}>
            <ZoomOut className="size-4" />
          </ToolbarButton>
          <button
            type="button"
            onClick={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
            title="Fit width"
            className="w-12 rounded-md py-1 text-center tabular-nums transition hover:bg-white/5 hover:text-slate-200"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolbarButton
            label="Zoom in"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
          >
            <ZoomIn className="size-4" />
          </ToolbarButton>
        </div>
      </div>

      <div
        ref={viewportRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Document page"
        className="relative min-h-0 flex-1 overflow-auto bg-slate-950/40 p-4 outline-none [scrollbar-gutter:stable]"
      >
        <Document
          file={file}
          options={PDF_DOCUMENT_OPTIONS}
          loading={<ViewerStatus message="Loading document…" />}
          error={<ViewerStatus message="This PDF could not be rendered." error />}
        >
          {pageWidth > 0 && (
            <Page
              pageNumber={page}
              width={pageWidth}
              renderAnnotationLayer={false}
              customTextRenderer={normalizedQuote ? textRenderer : undefined}
              onRenderTextLayerSuccess={normalizedQuote ? scrollToHighlight : undefined}
              loading={<ViewerStatus message={`Rendering page ${page}…`} />}
              className="mx-auto w-fit overflow-hidden rounded-md shadow-2xl shadow-black/50"
            />
          )}
        </Document>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 place-items-center rounded-md transition hover:bg-white/5 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ViewerStatus({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <div className={cn('flex h-64 items-center justify-center gap-2 text-sm', error ? 'text-rose-300' : 'text-slate-500')}>
      {error ? <TriangleAlert className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
      {message}
    </div>
  );
}
