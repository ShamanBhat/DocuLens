'use client';

import { MessageSquareText, RotateCcw } from 'lucide-react';
import type { ModelsStatus } from '@/hooks/use-model-selection';
import type { ModelOption } from '@/lib/ai/models';
import { cn } from '@/lib/utils';
import { ContextMeter } from './context-meter';
import { Logo } from './logo';
import { ModelSwitcher } from './model-switcher';

interface HeaderProps {
  models: ModelOption[];
  modelKey: string | null;
  activeModel: ModelOption | null;
  modelsStatus: ModelsStatus;
  onModelChange: (modelKey: string) => void;
  hasDocuments: boolean;
  bundleTokens: number;
  chatOpen: boolean;
  onToggleChat: () => void;
  onReset: () => void;
}

const ICON_BUTTON =
  'inline-flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white';

export function Header({
  models,
  modelKey,
  activeModel,
  modelsStatus,
  onModelChange,
  hasDocuments,
  bundleTokens,
  chatOpen,
  onToggleChat,
  onReset,
}: HeaderProps) {
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-slate-950/70 px-3 backdrop-blur-xl sm:px-4">
      <Logo />

      <div className="ml-auto flex items-center gap-2">
        {hasDocuments && activeModel && (
          <ContextMeter tokens={bundleTokens} contextWindow={activeModel.contextWindow} className="hidden md:flex" />
        )}

        <ModelSwitcher models={models} value={modelKey} onChange={onModelChange} status={modelsStatus} />

        {hasDocuments && (
          <>
            <button
              type="button"
              onClick={onToggleChat}
              aria-pressed={chatOpen}
              title={chatOpen ? 'Hide Q&A sidebar' : 'Show Q&A sidebar'}
              className={cn(ICON_BUTTON, 'hidden lg:inline-flex', chatOpen && 'border-indigo-400/30 bg-indigo-500/15 text-white')}
            >
              <MessageSquareText className="size-4" />
            </button>
            <button type="button" onClick={onReset} title="Start a new audit" className={ICON_BUTTON}>
              <RotateCcw className="size-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
