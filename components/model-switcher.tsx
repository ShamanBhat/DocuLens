'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Cpu, KeyRound, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelsStatus } from '@/hooks/use-model-selection';
import { PROVIDERS, type ModelOption, type ProviderId } from '@/lib/ai/models';
import { cn, formatTokens } from '@/lib/utils';

const PROVIDER_ACCENT: Record<ProviderId, string> = {
  anthropic: 'bg-orange-400',
  openai: 'bg-emerald-400',
  google: 'bg-sky-400',
};

interface ModelSwitcherProps {
  models: ModelOption[];
  value: string | null;
  onChange: (modelKey: string) => void;
  status: ModelsStatus;
}

/** Header dropdown that switches the model used for both the audit and chat at runtime. */
export function ModelSwitcher({ models, value, onChange, status }: ModelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.key === value) ?? null;

  const groups = useMemo(
    () =>
      (Object.keys(PROVIDERS) as ProviderId[])
        .map((provider) => ({ provider, models: models.filter((m) => m.provider === provider) }))
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

  const label =
    status === 'loading'
      ? 'Loading models…'
      : status === 'error'
        ? 'Models unavailable'
        : (selected?.label ?? 'Select a model');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={status !== 'ready'}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-60"
      >
        {status === 'loading' ? (
          <LoaderCircle className="size-3.5 animate-spin text-slate-400" />
        ) : selected ? (
          <span className={cn('size-2 rounded-full', PROVIDER_ACCENT[selected.provider])} />
        ) : (
          <Cpu className="size-3.5 text-slate-400" />
        )}
        <span className="max-w-36 truncate sm:max-w-56">{label}</span>
        <ChevronDown className={cn('size-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <div role="listbox" aria-label="AI model" className="max-h-[70vh] overflow-y-auto p-1.5">
              {groups.map(({ provider, models: providerModels }) => {
                const configured = providerModels.some((m) => m.available);
                return (
                  <div key={provider} className="py-1">
                    <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
                      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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

                    {providerModels.map((model) => {
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
                          <span className="mt-0.5 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                            {formatTokens(model.contextWindow)}
                          </span>
                          <Check className={cn('mt-0.5 size-4 shrink-0 text-indigo-300', !isSelected && 'invisible')} />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p className="border-t border-white/5 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              Routed through the Vercel AI SDK provider registry. Add models via{' '}
              <code className="font-mono text-slate-400">DOCULENS_EXTRA_MODELS</code>.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
