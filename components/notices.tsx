'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import type { Notice, NoticeTone } from '@/hooks/use-notices';
import { cn } from '@/lib/utils';

const TONES: Record<NoticeTone, { icon: LucideIcon; className: string }> = {
  error: { icon: CircleAlert, className: 'border-rose-400/25 bg-rose-950/80 text-rose-100' },
  warning: { icon: TriangleAlert, className: 'border-amber-400/25 bg-amber-950/80 text-amber-100' },
  info: { icon: Info, className: 'border-indigo-400/25 bg-slate-900/90 text-slate-100' },
};

export function Notices({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {notices.map((notice) => {
          const { icon: Icon, className } = TONES[notice.tone];
          return (
            <motion.div
              key={notice.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              role={notice.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-xl shadow-black/40 backdrop-blur',
                className,
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1 leading-snug">{notice.message}</p>
              <button
                type="button"
                onClick={() => onDismiss(notice.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 opacity-70 transition hover:opacity-100"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
