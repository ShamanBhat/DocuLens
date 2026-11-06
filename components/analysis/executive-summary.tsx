'use client';

import { motion } from 'framer-motion';
import { BookOpen, Building2, Layers, Lightbulb } from 'lucide-react';
import { EmptyHint, Section, Skeleton } from '@/components/ui/primitives';
import type { PartialAnalysis } from '@/lib/types';
import { cn, compact } from '@/lib/utils';

export function ExecutiveSummary({ summary }: { summary: PartialAnalysis['summary'] }) {
  if (!summary) return <SummarySkeleton />;

  const parties = compact(summary.parties);
  const structure = compact(summary.structure);
  const takeaways = compact(summary.keyTakeaways);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
            {summary.documentType ?? 'Analysing…'}
          </p>
          {summary.title ? (
            <h3 className="mt-1 text-lg font-semibold leading-snug text-slate-50">{summary.title}</h3>
          ) : (
            <Skeleton className="mt-2 h-6 w-2/3" />
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            {summary.effectiveDate && (
              <span>
                Effective <span className="text-slate-200">{summary.effectiveDate}</span>
              </span>
            )}
            {summary.governingLaw && (
              <span>
                Governing law <span className="text-slate-200">{summary.governingLaw}</span>
              </span>
            )}
          </div>
        </div>
        <RiskGauge score={summary.riskScore} />
      </div>

      {parties.length > 0 && (
        <Section title="Parties" icon={Building2}>
          <div className="flex flex-wrap gap-2">
            {parties.map((party, index) => (
              <span
                key={`${party.name}-${index}`}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs"
              >
                <span className="text-slate-100">{party.name}</span>
                {party.role && <span className="text-slate-500"> · {party.role}</span>}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Executive summary" icon={BookOpen}>
        {summary.overview ? (
          <p className="text-sm leading-relaxed text-slate-300">{summary.overview}</p>
        ) : (
          <TextSkeleton />
        )}
      </Section>

      <Section title="Intent & deal architecture" icon={Layers}>
        {summary.intent ? (
          <p className="text-sm leading-relaxed text-slate-300">{summary.intent}</p>
        ) : (
          <TextSkeleton />
        )}
        {structure.length > 0 && (
          <ol className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5">
            {structure.map((part, index) => (
              <li key={index} className="flex items-start gap-3 px-3 py-2.5">
                <span className="mt-0.5 font-mono text-[10px] text-slate-500">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-100">{part.heading}</p>
                  {part.purpose && <p className="mt-0.5 text-xs text-slate-400">{part.purpose}</p>}
                </div>
                {part.pages && (
                  <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    {part.pages}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Key takeaways" icon={Lightbulb}>
        {takeaways.length > 0 ? (
          <ul className="space-y-2">
            {takeaways.map((takeaway, index) => (
              <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-400" />
                {takeaway}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint>Takeaways will appear as the model streams its analysis.</EmptyHint>
        )}
      </Section>
    </div>
  );
}

function RiskGauge({ score }: { score: number | undefined }) {
  const value = typeof score === 'number' ? Math.min(100, Math.max(0, Math.round(score))) : null;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const tone =
    value === null ? 'text-slate-600' : value >= 70 ? 'text-rose-400' : value >= 40 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div
      role="img"
      aria-label={value === null ? 'Risk score pending' : `Overall risk score ${value} out of 100`}
      className="relative grid size-20 shrink-0 place-items-center"
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="6" className="stroke-white/10" />
        <motion.circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          className={cn('stroke-current', tone)}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - (value ?? 0) / 100) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="text-center leading-none">
        <div className={cn('text-lg font-semibold tabular-nums', tone)}>{value ?? '–'}</div>
        <div className="mt-1 text-[9px] uppercase tracking-wider text-slate-500">Risk</div>
      </div>
    </div>
  );
}

function TextSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-4/5" />
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-2/3" />
        </div>
        <Skeleton className="size-20 rounded-full" />
      </div>
      <TextSkeleton />
      <TextSkeleton />
    </div>
  );
}
