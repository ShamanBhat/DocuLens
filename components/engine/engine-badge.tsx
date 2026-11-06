'use client';

import { Cloud, Cpu, LoaderCircle, Lock, TriangleAlert } from 'lucide-react';
import type { EngineModel } from '@/lib/engines';
import { PROVIDERS } from '@/lib/ai/models';
import type { EngineSnapshot } from '@/lib/local/engine';
import { cn } from '@/lib/utils';

interface EngineBadgeProps {
  model: EngineModel | null;
  engine: EngineSnapshot;
  /** Opens the download/status overlay. */
  onClick: () => void;
}

const BASE =
  'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition focus-visible:outline-offset-2';

/**
 * Always-visible privacy + status indicator: green when inference is on this device, amber the
 * moment a cloud model is selected (document text leaves the browser), live progress while downloading.
 */
export function EngineBadge({ model, engine, onClick }: EngineBadgeProps) {
  if (!model) return null;

  if (model.kind === 'cloud') {
    return (
      <span
        className={cn(BASE, 'cursor-default border-amber-400/25 bg-amber-400/10 text-amber-200')}
        title={`Cloud mode: extracted document text is sent to ${PROVIDERS[model.provider].label} via this app's server.`}
      >
        <Cloud className="size-3.5" />
        <span className="hidden sm:inline">Cloud · text leaves device</span>
        <span className="sm:hidden">Cloud</span>
      </span>
    );
  }

  const active = engine.model?.key === model.key;
  const phase = active ? engine.phase : 'idle';

  if (phase === 'ready') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(BASE, 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15')}
        title="Inference runs entirely in this browser. Nothing is uploaded."
      >
        <Lock className="size-3.5" />
        <span className="hidden sm:inline">100% on-device</span>
        <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          {engine.device === 'webgpu' ? 'WebGPU' : 'CPU'}
        </span>
        {engine.tokensPerSecond !== null && (
          <span className="hidden font-mono text-[10px] tabular-nums text-emerald-300/80 md:inline">
            {engine.tokensPerSecond} tok/s
          </span>
        )}
      </button>
    );
  }

  if (phase === 'downloading' || phase === 'checking' || phase === 'compiling') {
    const percent = engine.progress?.percent ?? 0;
    const label =
      phase === 'downloading' ? `Downloading ${Math.round(percent)}%` : phase === 'compiling' ? 'Preparing GPU…' : 'Preparing…';
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(BASE, 'relative overflow-hidden border-indigo-400/30 bg-indigo-400/10 text-indigo-100 hover:bg-indigo-400/15')}
        title="Show download details"
      >
        {phase === 'downloading' && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-indigo-400/20 transition-[width]"
            style={{ width: `${percent}%` }}
          />
        )}
        <LoaderCircle className="relative size-3.5 animate-spin" />
        <span className="relative">{label}</span>
      </button>
    );
  }

  if (phase === 'error') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(BASE, 'border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15')}
        title={engine.error ?? 'The on-device model failed to load.'}
      >
        <TriangleAlert className="size-3.5" />
        Model error · retry
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(BASE, 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]')}
      title="The on-device model is not loaded yet"
    >
      <Cpu className="size-3.5" />
      On-device · not loaded
    </button>
  );
}
