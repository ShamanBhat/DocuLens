'use client';

import { MessageSquareText, RotateCcw } from 'lucide-react';
import type { CloudStatus } from '@/hooks/use-model-selection';
import { isCloudModel, type EngineModel } from '@/lib/engines';
import type { EngineSnapshot } from '@/lib/local/engine';
import { cn } from '@/lib/utils';
import { ContextMeter } from './context-meter';
import { EngineBadge } from './engine/engine-badge';
import { Logo } from './logo';
import { ModelSwitcher } from './model-switcher';

interface HeaderProps {
  models: EngineModel[];
  modelKey: string | null;
  activeModel: EngineModel | null;
  cloudStatus: CloudStatus;
  engine: EngineSnapshot;
  onModelChange: (modelKey: string) => void;
  onOpenEngine: () => void;
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
  cloudStatus,
  engine,
  onModelChange,
  onOpenEngine,
  hasDocuments,
  bundleTokens,
  chatOpen,
  onToggleChat,
  onReset,
}: HeaderProps) {
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-slate-950/70 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
      <Logo />

      <div className="ml-auto flex items-center gap-2">
        {/* A context meter only makes sense for cloud models: on-device audits window the text instead. */}
        {hasDocuments && isCloudModel(activeModel) && (
          <ContextMeter tokens={bundleTokens} contextWindow={activeModel.contextWindow} className="hidden md:flex" />
        )}

        <EngineBadge model={activeModel} engine={engine} onClick={onOpenEngine} />
        <ModelSwitcher models={models} value={modelKey} onChange={onModelChange} cloudStatus={cloudStatus} />

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
