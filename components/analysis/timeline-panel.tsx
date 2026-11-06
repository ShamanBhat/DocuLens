'use client';

import { CalendarClock, Package } from 'lucide-react';
import { CitationList } from '@/components/citation-chip';
import { EmptyHint, PanelSkeleton, Section } from '@/components/ui/primitives';
import type { KeyDateType } from '@/lib/ai/schemas';
import type { PartialAnalysis } from '@/lib/types';
import { cn, compact } from '@/lib/utils';

const DATE_TYPE_STYLES: Record<KeyDateType, string> = {
  effective: 'bg-sky-400/10 text-sky-300 ring-sky-400/20',
  expiration: 'bg-rose-400/10 text-rose-300 ring-rose-400/20',
  renewal: 'bg-amber-400/10 text-amber-300 ring-amber-400/20',
  notice: 'bg-violet-400/10 text-violet-300 ring-violet-400/20',
  payment: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20',
  deliverable: 'bg-indigo-400/10 text-indigo-300 ring-indigo-400/20',
  other: 'bg-white/5 text-slate-300 ring-white/10',
};

export function TimelinePanel({
  keyDates,
  deliverables,
  streaming,
}: Pick<PartialAnalysis, 'keyDates' | 'deliverables'> & { streaming: boolean }) {
  if (!keyDates && !deliverables) {
    return streaming ? <PanelSkeleton /> : <EmptyHint>The model did not return dates or deliverables.</EmptyHint>;
  }

  const dates = compact(keyDates);
  const items = compact(deliverables);

  return (
    <div className="space-y-6">
      <Section title="Key dates & deadlines" icon={CalendarClock}>
        {dates.length === 0 ? (
          <EmptyHint>{streaming ? 'Extracting dates…' : 'No dates extracted.'}</EmptyHint>
        ) : (
          <ul className="space-y-2">
            {dates.map((date, index) => (
              <li key={index} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="w-28 shrink-0 font-mono text-xs leading-relaxed text-slate-100">{date.date ?? '…'}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200">{date.label}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {date.type && (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                          DATE_TYPE_STYLES[date.type],
                        )}
                      >
                        {date.type}
                      </span>
                    )}
                    <CitationList citations={compact(date.citations)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Deliverables & obligations" icon={Package}>
        {items.length === 0 ? (
          <EmptyHint>{streaming ? 'Extracting deliverables…' : 'No deliverables extracted.'}</EmptyHint>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-100">{item.name}</p>
                  {item.dueDate && <span className="font-mono text-xs text-slate-300">Due {item.dueDate}</span>}
                </div>
                {item.owner && <p className="mt-1 text-xs text-slate-400">Owner · {item.owner}</p>}
                {item.acceptanceCriteria && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    <span className="text-slate-500">Acceptance: </span>
                    {item.acceptanceCriteria}
                  </p>
                )}
                <CitationList citations={compact(item.citations)} className="mt-2" />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
