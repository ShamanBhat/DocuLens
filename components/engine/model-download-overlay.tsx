'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Cpu, Download, LoaderCircle, Lock, RotateCcw, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EngineSnapshot } from '@/lib/local/engine';
import { expectedDownloadBytes, pickRuntime, type LocalModelSpec } from '@/lib/local/models';
import type { WebGpuSupport } from '@/lib/local/webgpu';
import { cn, formatBytes, formatDuration } from '@/lib/utils';

interface ModelDownloadOverlayProps {
  engine: EngineSnapshot;
  selected: LocalModelSpec | null;
  support: WebGpuSupport | null;
  dismissed: boolean;
  /** Auto-download is off (or Data Saver is on): wait for an explicit click. */
  deferred: boolean;
  onDismiss: () => void;
  onDownload: () => void;
  onCancel: () => void;
}

const LOADING_PHASES = new Set<EngineSnapshot['phase']>(['checking', 'downloading', 'compiling']);

function fileLabel(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * First-run experience for the on-device model: live bytes / percent / speed / ETA while the ONNX
 * weights stream from Hugging Face into the browser cache. Dismissible — progress continues in the header badge.
 */
export function ModelDownloadOverlay({
  engine,
  selected,
  support,
  dismissed,
  deferred,
  onDismiss,
  onDownload,
  onCancel,
}: ModelDownloadOverlayProps) {
  const active = selected !== null && engine.model?.key === selected.key;
  const loading = active && LOADING_PHASES.has(engine.phase);
  const failed = active && engine.phase === 'error';
  const waiting = selected !== null && !active && deferred;
  const visible = selected !== null && !dismissed && (loading || failed || waiting);

  return (
    <AnimatePresence>
      {visible && selected && (
        <motion.div
          key="engine-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="On-device model download"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/60"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl"
            />

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Hide this panel"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
            >
              <X className="size-4" />
            </button>

            {failed ? (
              <FailedView engine={engine} model={selected} onRetry={onDownload} />
            ) : waiting ? (
              <WaitingView model={selected} support={support} onDownload={onDownload} />
            ) : (
              <LoadingView engine={engine} onDismiss={onDismiss} onCancel={onCancel} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PanelHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="relative flex items-start gap-4 pr-8">
      <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-indigo-500/30 to-cyan-400/20 ring-1 ring-white/10">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function PrivacyNote() {
  return (
    <p className="relative mt-5 flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-3 py-2.5 text-xs leading-relaxed text-emerald-100/90">
      <Lock className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
      <span>
        Weights download <strong className="font-medium text-emerald-200">once</strong> straight from Hugging Face into your
        browser&apos;s cache. Your documents never leave this tab — inference runs on your own GPU.
      </span>
    </p>
  );
}

function LoadingView({
  engine,
  onDismiss,
  onCancel,
}: {
  engine: EngineSnapshot;
  onDismiss: () => void;
  onCancel: () => void;
}) {
  const { phase, progress, model, fromCache, device, dtype, notice } = engine;
  const determinate = phase === 'downloading' && progress !== null && progress.totalBytes > 0;
  const percent = determinate ? progress.percent : 0;

  const title =
    phase === 'checking'
      ? 'Preparing on-device AI'
      : phase === 'downloading'
        ? `Downloading ${model?.label ?? 'model'}`
        : fromCache
          ? 'Loading from your browser cache'
          : 'Compiling GPU kernels';

  const subtitle =
    phase === 'compiling'
      ? fromCache
        ? 'No download needed — this model is already cached on this device.'
        : 'Download complete. Initialising the model on your GPU…'
      : phase === 'checking'
        ? 'Checking the local cache…'
        : 'ONNX weights are streaming from huggingface.co into local storage.';

  const files = (progress?.files ?? []).filter((file) => file.total > 0).slice(0, 3);

  return (
    <>
      <PanelHeader
        icon={
          phase === 'downloading' ? (
            <Download className="size-5 text-indigo-200" />
          ) : (
            <LoaderCircle className="size-5 animate-spin text-indigo-200" />
          )
        }
        title={title}
        subtitle={subtitle}
      />

      <div className="relative mt-6">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-semibold tabular-nums text-white">{determinate ? `${percent.toFixed(percent < 10 ? 1 : 0)}%` : '…'}</span>
          <span className="tabular-nums text-slate-400">
            {progress && progress.totalBytes > 0
              ? `${formatBytes(progress.loadedBytes)} / ${formatBytes(progress.totalBytes)}`
              : 'Calculating size…'}
          </span>
        </div>

        <div
          className="h-2.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={determinate ? Math.round(percent) : undefined}
          aria-label="Model download progress"
        >
          {determinate ? (
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-indigo-400 via-sky-400 to-cyan-300"
              animate={{ width: `${Math.max(1.5, percent)}%` }}
              transition={{ ease: 'easeOut', duration: 0.25 }}
            />
          ) : (
            <motion.div
              className="h-full w-1/3 rounded-full bg-linear-to-r from-transparent via-indigo-400 to-transparent"
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>

        {determinate && progress && (
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span className="tabular-nums">
              {progress.bytesPerSecond > 0 ? `${formatBytes(progress.bytesPerSecond)}/s` : 'measuring speed…'}
            </span>
            <span className="tabular-nums">
              {progress.etaSeconds !== null ? `${formatDuration(progress.etaSeconds)} left` : ''}
            </span>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <ul className="relative mt-5 space-y-2" aria-label="Files">
          {files.map((file) => {
            const filePercent = file.total > 0 ? Math.min(100, (file.loaded / file.total) * 100) : 0;
            return (
              <li key={file.file} className="flex items-center gap-3 text-xs">
                <span className="w-40 shrink-0 truncate font-mono text-slate-400" title={file.file}>
                  {fileLabel(file.file)}
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn('h-full rounded-full transition-[width]', file.done ? 'bg-emerald-400' : 'bg-indigo-400')}
                    style={{ width: `${filePercent}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right tabular-nums text-slate-500">
                  {file.done ? <Check className="ml-auto size-3.5 text-emerald-400" /> : formatBytes(file.total)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Cpu className="size-3.5" />
          {device === 'webgpu' ? 'WebGPU' : 'CPU (WASM)'} · {dtype}
        </span>
        <span>Stored in Cache Storage</span>
      </div>

      {notice && (
        <p className="relative mt-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
          {notice}
        </p>
      )}

      <PrivacyNote />

      <div className="relative mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={onCancel} className="text-xs text-slate-500 transition hover:text-slate-300">
          Cancel download
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-indigo-50"
        >
          Continue in background
        </button>
      </div>
    </>
  );
}

function WaitingView({
  model,
  support,
  onDownload,
}: {
  model: LocalModelSpec;
  support: WebGpuSupport | null;
  onDownload: () => void;
}) {
  const runtime = pickRuntime(support ?? { supported: false, fp16: false });
  const bytes = expectedDownloadBytes(model, runtime.dtype);

  return (
    <>
      <PanelHeader
        icon={<Download className="size-5 text-indigo-200" />}
        title={`Download ${model.label}?`}
        subtitle={bytes > 0 ? `One-time download of about ${formatBytes(bytes)}.` : 'One-time model download.'}
      />
      <p className="relative mt-4 text-sm leading-relaxed text-slate-400">
        Automatic download is paused (Data Saver or configuration). Start it when you&apos;re on a suitable connection — the
        model is cached afterwards and works offline.
      </p>
      <PrivacyNote />
      <button
        type="button"
        onClick={onDownload}
        className="relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"
      >
        <Download className="size-4" />
        Download model
      </button>
    </>
  );
}

function FailedView({
  engine,
  model,
  onRetry,
}: {
  engine: EngineSnapshot;
  model: LocalModelSpec;
  onRetry: () => void;
}) {
  return (
    <>
      <PanelHeader
        icon={<TriangleAlert className="size-5 text-rose-300" />}
        title="Couldn’t start the on-device model"
        subtitle={`${model.label} failed to load.`}
      />
      <p
        role="alert"
        className="relative mt-4 max-h-32 overflow-y-auto rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2.5 font-mono text-xs leading-relaxed text-rose-100"
      >
        {engine.error ?? 'Unknown error.'}
      </p>
      <ul className="relative mt-4 list-disc space-y-1 pl-5 text-xs text-slate-400">
        <li>Use a recent Chrome or Edge with WebGPU enabled, or try the smaller SmolLM2 360M model.</li>
        <li>Check your connection to huggingface.co (or your configured mirror) and retry.</li>
        <li>Close GPU-heavy tabs; large models need free GPU memory.</li>
      </ul>
      <button
        type="button"
        onClick={onRetry}
        className="relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-indigo-50"
      >
        <RotateCcw className="size-4" />
        Retry
      </button>
    </>
  );
}
