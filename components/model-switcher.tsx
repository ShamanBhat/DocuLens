'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Cloud, KeyRound, LoaderCircle, Lock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CloudStatus } from '@/hooks/use-model-selection';
import { PROVIDERS, type ProviderId } from '@/lib/ai/models';
import type { EngineModel } from '@/lib/engines';
import type { LocalModelSpec } from '@/lib/local/models';
import { cn, formatBytes, formatTokens } from '@/lib/utils';

const PROVIDER_ACCENT: Record<ProviderId, string> = {
  anthropic: 'bg-orange-400',
  openai: 'bg-emerald-400',
  google: 'bg-sky-400',
};

interface ModelSwitcherProps {
  models: EngineModel[];
  value: string | null;
  onChange: (modelKey: string) => void;
  cloudStatus: CloudStatus;
}

/** Header dropdown that switches the engine for both the audit and chat: on-device first, cloud as fallback. */
export function ModelSwitcher({ models, value, onChange, cloudStatus }: ModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.key === value) ?? null;

  const localModels = useMemo(() => models.filter((model): model is LocalModelSpec => model.kind === 'local'), [models]);
  const cloudGroups = useMemo(
    () =>
      (Object.keys(PROVIDERS) as ProviderId[])
        .map((provider) => ({
          provider,
          models: models.filter((model) => model.kind === 'cloud' && model.provider === provider),
        }))
        .filter((group) => group.models.length > 0),
    [models],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const accent = selected?.kind === 'cloud' ? PROVIDER_ACCENT[selected.provider] : 'bg-emerald-400';

  const renderOption = (model: EngineModel, meta: string) => {
    const isSelected = model.key === value;
    return (
      <button
        key={model.key}
        type="button"
        role="option"
        aria-selected={isSelected}
        disabled={!model.available}
        onClick={() => {
          onChange(model.key);
          setOpen(false);
        }}
        className={cn(
          'flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition',
          isSelected ? 'bg-indigo-500/15' : 'hover:bg-white/[0.05]',
          !model.available && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-100">{model.label}</p>
          <p className="truncate text-xs text-slate-500">{model.description}</p>
        </div>
        <span className="mt-0.5 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{meta}</span>
        <Check className={cn('mt-0.5 size-4 shrink-0 text-indigo-300', !isSelected && 'invisible')} />
      </button>
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
      >
        <span className={cn('size-2 rounded-full', accent)} />
        <span className="max-w-32 truncate sm:max-w-52">{selected?.label ?? 'Select a model'}</span>
        <ChevronDown className={cn('size-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 z-50 mt-2 w-[min(23rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <div role="listbox" aria-label="AI model" className="max-h-[70vh] overflow-y-auto p-1.5">
              <div className="py-1">
                <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                    <Lock className="size-3" />
                    On this device · private
                  </span>
                  <span className="text-[10px] text-slate-500">WebGPU · downloads once</span>
                </div>
                {localModels.map((model) =>
                  renderOption(model, model.downloadBytes ? `~${formatBytes(model.downloadBytes.q4f16)}` : model.parameters),
                )}
              </div>

              <div className="mt-1 border-t border-white/5 py-1">
                <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                    <Cloud className="size-3" />
                    Cloud fallback · text leaves device
                  </span>
                </div>

                {cloudStatus === 'off' && (
                  <p className="px-2.5 py-2 text-xs text-slate-500">Cloud models are disabled (NEXT_PUBLIC_CLOUD_FALLBACK=off).</p>
                )}
                {cloudStatus === 'loading' && (
                  <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-slate-500">
                    <LoaderCircle className="size-3 animate-spin" />
                    Checking configured providers…
                  </p>
                )}
                {cloudStatus === 'error' && (
                  <p className="px-2.5 py-2 text-xs text-slate-500">Cloud models are unavailable (the model list could not be loaded).</p>
                )}

                {cloudGroups.map(({ provider, models: providerModels }) => {
                  const configured = providerModels.some((model) => model.available);
                  return (
                    <div key={provider} className="pb-1">
                      <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
                        <span className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
                          <span className={cn('size-1.5 rounded-full', PROVIDER_ACCENT[provider])} />
                          {PROVIDERS[provider].label}
                        </span>
                        {!configured && (
                          <span
                            className="flex items-center gap-1 font-mono text-[10px] text-amber-300/80"
                            title="Add this key to .env.local to enable these models"
                          >
                            <KeyRound className="size-3" />
                            {PROVIDERS[provider].envKey}
                          </span>
                        )}
                      </div>
                      {providerModels.map((model) => renderOption(model, formatTokens(model.contextWindow)))}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="border-t border-white/5 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              On-device models run with Transformers.js + WebGPU. Cloud models are routed through the Vercel AI SDK registry on
              your server.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
