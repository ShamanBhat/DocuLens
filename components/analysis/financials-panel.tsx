'use client';

import { CircleDollarSign, Flag } from 'lucide-react';
import { CitationList } from '@/components/citation-chip';
import { EmptyHint, PanelSkeleton, Section } from '@/components/ui/primitives';
import type { PartialAnalysis } from '@/lib/types';
import { cn, compact } from '@/lib/utils';

export function FinancialsPanel({
  financials,
  streaming,
}: {
  financials: PartialAnalysis['financials'];
  streaming: boolean;
}) {
  if (!financials) {
    return streaming ? <PanelSkeleton /> : <EmptyHint>The model did not return financial terms.</EmptyHint>;
  }

  const terms = compact(financials.terms);
  const milestones = compact(financials.milestones);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="Total contract value" value={financials.totalValue ?? 'Not stated'} accent className="col-span-2 sm:col-span-1" />
        <Metric label="Currency" value={financials.currency ?? '—'} />
        <Metric label="Payment milestones" value={String(milestones.length)} />
      </div>

      <Section title="Financial terms" icon={CircleDollarSign}>
        {terms.length === 0 ? (
          <EmptyHint>No explicit financial terms extracted.</EmptyHint>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Term</th>
                  <th scope="col" className="px-3 py-2 font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2 font-medium">Frequency</th>
                  <th scope="col" className="px-3 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {terms.map((term, index) => (
                  <tr key={index} className="align-top">
                    <td className="px-3 py-2.5">
                      <p className="text-slate-200">{term.label}</p>
                      {term.notes && <p className="mt-0.5 text-xs text-slate-500">{term.notes}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-emerald-300">{term.amount}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{term.frequency ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <CitationList citations={compact(term.citations)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Payment milestones" icon={Flag}>
        {milestones.length === 0 ? (
          <EmptyHint>No payment milestones extracted.</EmptyHint>
        ) : (
          <ol className="relative ml-1.5 space-y-4 border-l border-white/10 pl-5">
            {milestones.map((milestone, index) => (
              <li key={index} className="relative">
                <span className="absolute -left-[25.5px] top-1.5 size-2.5 rounded-full bg-emerald-400 ring-4 ring-slate-900" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-100">{milestone.name}</p>
                  {milestone.amount && <span className="font-mono text-xs text-emerald-300">{milestone.amount}</span>}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {milestone.trigger}
                  {milestone.dueDate && <span className="text-slate-300"> · Due {milestone.dueDate}</span>}
                </p>
                <CitationList citations={compact(milestone.citations)} className="mt-2" />
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-white/5 bg-white/[0.02] p-3', className)}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn('mt-1 truncate text-base font-semibold', accent ? 'text-emerald-300' : 'text-slate-100')} title={value}>
        {value}
      </p>
    </div>
  );
}
