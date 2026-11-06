'use client';

import { motion } from 'framer-motion';
import { Gauge } from 'lucide-react';
import { cn, formatTokens } from '@/lib/utils';

/** Shows how much of the selected model's context window the bundle consumes. */
export function ContextMeter({
  tokens,
  contextWindow,
  className,
}: {
  tokens: number;
  contextWindow: number;
  className?: string;
}) {
  const ratio = contextWindow > 0 ? tokens / contextWindow : 0;
  const percent = Math.min(100, Math.round(ratio * 100));
  const tone = ratio > 0.9 ? 'bg-rose-400' : ratio > 0.65 ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div
      className={cn(
        'items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5',
        className,
      )}
      title={`≈${tokens.toLocaleString()} tokens of a ${contextWindow.toLocaleString()}-token context window (${percent}%)`}
    >
      <Gauge className="size-3.5 text-slate-400" />
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className={cn('h-full rounded-full', tone)}
          initial={false}
          animate={{ width: `${Math.max(2, percent)}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-slate-400">
        {formatTokens(tokens)} / {formatTokens(contextWindow)}
      </span>
    </div>
  );
}
