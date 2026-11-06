'use client';

/**
 * DocuLens — main dashboard.
 *
 *  ┌── Header: logo · privacy/engine badge · model switcher (on-device ▸ cloud fallback) ──┐
 *  │ PDF viewer (bundle tabs) │ Audit dashboard (local worker or cloud) │ Grounded Q&A chat │
 *  └────────────────────────────────────────────────────────────────────────────────────────┘
 *  + First-run overlay: live Hugging Face → browser-cache download progress for the on-device model.
 *
 * Every citation in the dashboard and chat is wired back to the viewer through CitationProvider,
 * so clicking "D2 · p.41" opens that page and highlights the quote.
 */

import { FileText, MessageSquareText, ShieldAlert, type LucideIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { AnalysisDashboard } from '@/components/analysis/analysis-dashboard';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { CitationProvider, type CitationNavigator } from '@/components/citation-context';
import { DocumentTabs } from '@/components/document-tabs';
import { ModelDownloadOverlay } from '@/components/engine/model-download-overlay';
import { Header } from '@/components/header';
import { Landing } from '@/components/landing';
import { Notices } from '@/components/notices';
import { PanelLoader } from '@/components/ui/primitives';
import { useDocumentBundle } from '@/hooks/use-document-bundle';
import {
  loadLocalModel,
  prefersDataSaving,
  unloadLocalModel,
  useLocalEngine,
  useLocalEngineAutoload,
  useWebGpuSupport,
} from '@/hooks/use-local-engine';
import { useModelSelection } from '@/hooks/use-model-selection';
import { useNotices } from '@/hooks/use-notices';
import { CLIENT_CONFIG } from '@/lib/config';
import { isLocalModel } from '@/lib/engines';
import type { CitationTarget } from '@/lib/types';
import { cn } from '@/lib/utils';

// PDF.js relies on browser-only APIs (DOMMatrix, Web Workers) — never render it on the server.
const PdfViewer = dynamic(() => import('@/components/pdf-viewer'), {
  ssr: false,
  loading: () => <PanelLoader label="Loading viewer…" />,
});

type Pane = 'viewer' | 'analysis' | 'chat';

interface Highlight {
  documentId: string;
  page: number;
  quote: string;
}

const PANEL =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-900/50 shadow-xl shadow-black/20 backdrop-blur-sm';

const PANES: { id: Pane; label: string; icon: LucideIcon }[] = [
  { id: 'viewer', label: 'Document', icon: FileText },
  { id: 'analysis', label: 'Audit', icon: ShieldAlert },
  { id: 'chat', label: 'Ask', icon: MessageSquareText },
];

export default function DocuLensPage() {
  const { models, modelKey, activeModel, setModelKey, cloudStatus, hydrated } = useModelSelection();
  const { documents, version, ingest, addFiles, removeDocument, reset } = useDocumentBundle();
  const { notices, notify, dismiss } = useNotices();
  const engine = useLocalEngine();
  const webgpu = useWebGpuSupport();

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [pageByDoc, setPageByDoc] = useState<Record<string, number>>({});
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [pane, setPane] = useState<Pane>('viewer');
  // Dismissal is remembered per model, so picking another on-device model brings the progress panel back.
  const [dismissedModelKey, setDismissedModelKey] = useState<string | null>(null);

  const localModel = isLocalModel(activeModel) ? activeModel : null;
  const overlayDismissed = localModel !== null && dismissedModelKey === localModel.key;

  // Start fetching the on-device model as soon as the app opens (first visit: Hugging Face -> browser cache).
  useLocalEngineAutoload(localModel, hydrated);

  // Data Saver / NEXT_PUBLIC_AUTO_DOWNLOAD=off defer the download until the user asks for it.
  const deferred = useMemo(
    () => hydrated && (!CLIENT_CONFIG.autoDownload || prefersDataSaving()),
    [hydrated],
  );

  const activeDoc = documents.find((doc) => doc.id === activeDocId) ?? documents[0] ?? null;
  const activePage = activeDoc ? (pageByDoc[activeDoc.id] ?? 1) : 1;
  const bundleTokens = useMemo(() => documents.reduce((sum, doc) => sum + doc.tokenEstimate, 0), [documents]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const { added, issues } = await addFiles(files);
      issues.forEach((message) => notify(message, 'error'));
      added
        .filter((doc) => !doc.hasTextLayer)
        .forEach((doc) =>
          notify(`“${doc.name}” has little or no selectable text (scanned?). Run OCR first for a complete audit.`, 'warning'),
        );
      if (added[0]) {
        setActiveDocId(added[0].id);
        setPane('viewer');
      }
    },
    [addFiles, notify],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      if (activeDoc) setPageByDoc((prev) => ({ ...prev, [activeDoc.id]: page }));
    },
    [activeDoc],
  );

  /** Citation → open document, jump to page, highlight the quoted text. */
  const navigate = useCallback(
    (target: CitationTarget) => {
      const doc = documents.find((d) => d.id === target.documentId);
      if (!doc) {
        notify(`Citation points to ${target.documentId}, which isn’t in this bundle.`, 'warning');
        return;
      }
      const page = Math.min(Math.max(1, Math.round(target.page)), doc.pageCount);
      setActiveDocId(doc.id);
      setPageByDoc((prev) => ({ ...prev, [doc.id]: page }));
      setHighlight(target.quote ? { documentId: doc.id, page, quote: target.quote } : null);
      setPane('viewer');
    },
    [documents, notify],
  );

  const citationNavigator = useMemo<CitationNavigator>(
    () => ({ navigate, documentName: (id) => documents.find((doc) => doc.id === id)?.name }),
    [navigate, documents],
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeDocument(id);
      setHighlight((current) => (current?.documentId === id ? null : current));
    },
    [removeDocument],
  );

  const handleReset = useCallback(() => {
    if (!window.confirm('Start a new audit? Current documents, analysis and chat will be cleared.')) return;
    reset();
    setActiveDocId(null);
    setPageByDoc({});
    setHighlight(null);
    setPane('viewer');
  }, [reset]);

  const startDownload = useCallback(() => {
    if (!localModel) return;
    setDismissedModelKey(null);
    void loadLocalModel(localModel).catch(() => undefined); // failures are shown by the overlay/badge
  }, [localModel]);

  const cancelDownload = useCallback(() => {
    unloadLocalModel();
    setDismissedModelKey(localModel?.key ?? null);
  }, [localModel]);

  const handleOpenEngine = useCallback(() => {
    // Clicking the badge on an unloaded/failed model starts (or retries) the load; otherwise it just reopens the panel.
    if (localModel && (engine.model?.key !== localModel.key || engine.phase === 'error' || engine.phase === 'idle')) {
      startDownload();
    } else {
      setDismissedModelKey(null);
    }
  }, [engine.model?.key, engine.phase, localModel, startDownload]);

  const viewerHighlight =
    highlight && activeDoc && highlight.documentId === activeDoc.id && highlight.page === activePage
      ? highlight.quote
      : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        models={models}
        modelKey={modelKey}
        activeModel={activeModel}
        cloudStatus={cloudStatus}
        engine={engine}
        onModelChange={setModelKey}
        onOpenEngine={handleOpenEngine}
        hasDocuments={documents.length > 0}
        bundleTokens={bundleTokens}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((open) => !open)}
        onReset={handleReset}
      />

      {documents.length === 0 ? (
        <Landing onFiles={(files) => void handleFiles(files)} ingest={ingest} webgpu={webgpu} />
      ) : (
        <CitationProvider value={citationNavigator}>
          {/* Small screens: one pane at a time */}
          <nav aria-label="Workspace panes" className="flex gap-1 px-3 pt-3 lg:hidden">
            {PANES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={pane === id}
                onClick={() => setPane(id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition',
                  pane === id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </nav>

          <main className="flex min-h-0 flex-1 gap-3 p-3">
            <section
              aria-label="Document viewer"
              className={cn(PANEL, pane !== 'viewer' && 'hidden', 'lg:flex lg:flex-[1.15]')}
            >
              <DocumentTabs
                documents={documents}
                activeId={activeDoc?.id ?? null}
                onSelect={setActiveDocId}
                onRemove={handleRemove}
                onAddFiles={handleFiles}
                ingest={ingest}
              />
              {activeDoc && (
                <PdfViewer
                  key={activeDoc.id}
                  file={activeDoc.file}
                  pageCount={activeDoc.pageCount}
                  page={activePage}
                  onPageChange={handlePageChange}
                  highlight={viewerHighlight}
                />
              )}
            </section>

            <section aria-label="Audit dashboard" className={cn(PANEL, pane !== 'analysis' && 'hidden', 'lg:flex')}>
              <AnalysisDashboard key={version} documents={documents} model={activeModel} />
            </section>

            {/* Kept mounted when hidden so the conversation survives toggling */}
            <aside
              aria-label="Grounded Q&A"
              className={cn(
                PANEL,
                'lg:w-[380px] lg:flex-none xl:w-[420px]',
                pane !== 'chat' && 'hidden',
                chatOpen ? 'lg:flex' : 'lg:hidden',
              )}
            >
              <ChatSidebar key={version} documents={documents} model={activeModel} />
            </aside>
          </main>
        </CitationProvider>
      )}

      <ModelDownloadOverlay
        engine={engine}
        selected={localModel}
        support={webgpu}
        dismissed={overlayDismissed}
        deferred={deferred}
        onDismiss={() => setDismissedModelKey(localModel?.key ?? null)}
        onDownload={startDownload}
        onCancel={cancelDownload}
      />

      <Notices notices={notices} onDismiss={dismiss} />
    </div>
  );
}
