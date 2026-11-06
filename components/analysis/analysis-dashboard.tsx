'use client';

import { experimental_useObject as useObject } from '@ai-sdk/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  CircleAlert,
  CircleDollarSign,
  Download,
  LayoutDashboard,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ModelOption } from '@/lib/ai/models';
import { analysisSchema } from '@/lib/ai/schemas';
import { fitsInContext, toDocumentPayload } from '@/lib/documents/context';
import type { LoadedDocument, PartialAnalysis } from '@/lib/types';
import { cn, formatTokens, readableError } from '@/lib/utils';
import { ExecutiveSummary } from './executive-summary';
import { FinancialsPanel } from './financials-panel';
import { RiskMatrix } from './risk-matrix';
import { TimelinePanel } from './timeline-panel';

type TabId = 'overview' | 'risks' | 'financials' | 'timeline';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'risks', label: 'Risk matrix', icon: ShieldAlert },
  { id: 'financials', label: 'Financials', icon: CircleDollarSign },
  { id: 'timeline', label: 'Dates & deliverables', icon: CalendarClock },
];

/** Schema keys in reverse streaming order — the first one present is the section being generated. */
const SECTION_PROGRESS: [keyof PartialAnalysis, string][] = [
  ['deliverables', 'deliverables'],
  ['keyDates', 'key dates'],
  ['financials', 'financials'],
  ['gaps', 'missing protections'],
  ['conflicts', 'cross-clause conflicts'],
  ['risks', 'risk register'],
  ['summary', 'executive summary'],
];

interface AnalysisRun {
  modelLabel: string;
  startedAt: number;
  now: number;
}

interface AnalysisDashboardProps {
  documents: LoadedDocument[];
  model: ModelOption | null;
}

/**
 * Streams a schema-validated audit from /api/analyze with `useObject` and renders it
 * progressively. The same UI works for every provider because the schema is shared.
 */
export function AnalysisDashboard({ documents, model }: AnalysisDashboardProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [incomplete, setIncomplete] = useState(false);

  const { object, submit, isLoading, error, stop } = useObject({
    api: '/api/analyze',
    schema: analysisSchema,
    onFinish: ({ error: validationError }) => {
      setIncomplete(validationError !== undefined);
      setRun((current) => (current ? { ...current, now: Date.now() } : current));
    },
  });
  const analysis = object as PartialAnalysis | undefined;

  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setInterval(() => setRun((current) => (current ? { ...current, now: Date.now() } : current)), 1000);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  const bundleTokens = useMemo(() => documents.reduce((sum, doc) => sum + doc.tokenEstimate, 0), [documents]);
  const fits = model !== null && fitsInContext(bundleTokens, model.contextWindow);
  const hasResult = analysis !== undefined && Object.keys(analysis).length > 0;
  const elapsed = run ? Math.max(0, Math.round((run.now - run.startedAt) / 1000)) : 0;
  const currentSection = analysis ? SECTION_PROGRESS.find(([key]) => analysis[key] !== undefined)?.[1] : undefined;

  const counts: Partial<Record<TabId, number>> = {
    risks: (analysis?.risks?.length ?? 0) + (analysis?.conflicts?.length ?? 0) + (analysis?.gaps?.length ?? 0),
    financials: (analysis?.financials?.terms?.length ?? 0) + (analysis?.financials?.milestones?.length ?? 0),
    timeline: (analysis?.keyDates?.length ?? 0) + (analysis?.deliverables?.length ?? 0),
  };

  const start = () => {
    if (!model || isLoading) return;
    const now = Date.now();
    setIncomplete(false);
    setRun({ modelLabel: model.label, startedAt: now, now });
    setTab('overview');
    submit({ modelKey: model.key, documents: toDocumentPayload(documents) });
  };

  const exportReport = () => {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify({ model: run?.modelLabel, analysis }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `doculens-audit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <ShieldAlert className="size-4 text-indigo-300" />
            Audit dashboard
          </h2>
          <p className="truncate text-xs text-slate-500">
            {run ? (
              <>
                via <span className="text-slate-300">{run.modelLabel}</span> · {elapsed}s
                {isLoading && ` · generating ${currentSection ?? 'analysis'}…`}
              </>
            ) : (
              'Structured, citation-grounded audit of the full bundle'
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isLoading ? (
            <ActionButton icon={Square} label="Stop" onClick={stop} />
          ) : hasResult ? (
            <>
              <ActionButton icon={Download} label="Export" onClick={exportReport} />
              <ActionButton icon={RotateCcw} label="Re-run" onClick={start} disabled={!model || !fits} />
            </>
          ) : null}
        </div>
      </header>

      {isLoading && (
        <div className="h-0.5 w-full overflow-hidden bg-white/5">
          <motion.div
            className="h-full w-1/3 bg-linear-to-r from-transparent via-indigo-400 to-transparent"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}

      {error && (
        <Banner tone="error" icon={CircleAlert}>
          {readableError(error)}
          <button type="button" onClick={start} className="ml-2 font-medium underline underline-offset-2">
            Retry
          </button>
        </Banner>
      )}
      {incomplete && !isLoading && (
        <Banner tone="warning" icon={TriangleAlert}>
          The model’s output didn’t fully match the audit schema, so some sections may be incomplete. Re-run or try
          another model.
        </Banner>
      )}

      {hasResult ? (
        <>
          <nav role="tablist" aria-label="Audit sections" className="flex gap-1 overflow-x-auto border-b border-white/5 px-3">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              const count = counts[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-xs font-medium transition',
                    active ? 'text-white' : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums">{count}</span>
                  )}
                  {active && (
                    <motion.span
                      layoutId="audit-tab-indicator"
                      className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-linear-to-r from-indigo-400 to-cyan-300"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
              >
                {tab === 'overview' && <ExecutiveSummary summary={analysis.summary} />}
                {tab === 'risks' && (
                  <RiskMatrix
                    risks={analysis.risks}
                    conflicts={analysis.conflicts}
                    gaps={analysis.gaps}
                    streaming={isLoading}
                  />
                )}
                {tab === 'financials' && <FinancialsPanel financials={analysis.financials} streaming={isLoading} />}
                {tab === 'timeline' && (
                  <TimelinePanel keyDates={analysis.keyDates} deliverables={analysis.deliverables} streaming={isLoading} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      ) : isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Sparkles className="size-6 animate-pulse text-indigo-300" />
          <p className="text-sm text-slate-300">Reading the entire bundle…</p>
          <p className="max-w-xs text-xs text-slate-500">
            Long-context models read every page before writing. Results stream in section by section.
          </p>
        </div>
      ) : (
        <AnalysisLauncher documents={documents} model={model} bundleTokens={bundleTokens} fits={fits} onStart={start} />
      )}
    </div>
  );
}

function AnalysisLauncher({
  documents,
  model,
  bundleTokens,
  fits,
  onStart,
}: {
  documents: LoadedDocument[];
  model: ModelOption | null;
  bundleTokens: number;
  fits: boolean;
  onStart: () => void;
}) {
  const pages = documents.reduce((sum, doc) => sum + doc.pageCount, 0);

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center"
      >
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-linear-to-br from-indigo-500/20 to-cyan-400/20 ring-1 ring-white/10">
          <Sparkles className="size-6 text-indigo-300" />
        </div>
        <h3 className="text-lg font-semibold text-slate-100">Run a deep audit</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The whole bundle goes to the model in a single long-context pass — no chunking, no lossy retrieval — so
          conflicts between distant clauses are caught.
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-2 text-left">
          <Stat label="Documents" value={String(documents.length)} />
          <Stat label="Pages" value={pages.toLocaleString()} />
          <Stat label="≈ Tokens" value={formatTokens(bundleTokens)} />
        </dl>

        {model && !fits && (
          <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            This bundle exceeds the {formatTokens(model.contextWindow)}-token context window of {model.label}. Switch to a
            1M-token model such as Gemini 2.5 Pro or GPT-4.1.
          </p>
        )}

        <button
          type="button"
          onClick={onStart}
          disabled={!model || !fits}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="size-4" />
          {model ? `Audit with ${model.label}` : 'Select a model to begin'}
        </button>

        <ul className="mt-6 space-y-2 text-left text-xs text-slate-400">
          <li className="flex gap-2">
            <LayoutDashboard className="size-3.5 shrink-0 text-indigo-300" />
            Executive summary, intent and deal architecture
          </li>
          <li className="flex gap-2">
            <ShieldAlert className="size-3.5 shrink-0 text-indigo-300" />
            Risk matrix incl. cross-clause conflicts, missing indemnities and compliance gaps
          </li>
          <li className="flex gap-2">
            <CircleDollarSign className="size-3.5 shrink-0 text-indigo-300" />
            Financials, payment milestones, expiration dates and deliverables
          </li>
        </ul>
      </motion.div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums text-slate-100">{value}</dd>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white disabled:opacity-50"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'error' | 'warning';
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'mx-4 mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
        tone === 'error' ? 'border-rose-400/20 bg-rose-500/10 text-rose-200' : 'border-amber-400/20 bg-amber-400/10 text-amber-200',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
