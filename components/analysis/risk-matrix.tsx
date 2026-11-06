'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, GitCompareArrows, ShieldAlert, ShieldX, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CitationList, type CitationLike } from '@/components/citation-chip';
import {
  EmptyHint,
  PanelSkeleton,
  SEVERITY_ORDER,
  SEVERITY_RANK,
  SEVERITY_STYLES,
  SeverityBadge,
} from '@/components/ui/primitives';
import type { Severity } from '@/lib/ai/schemas';
import type { PartialAnalysis } from '@/lib/types';
import { cn, compact, humanize } from '@/lib/utils';

type FindingKind = 'risk' | 'conflict' | 'gap';

/** Risks, cross-clause conflicts and gaps normalized into one sortable list. */
interface Finding {
  key: string;
  kind: FindingKind;
  title: string;
  severity: Severity;
  /** Matrix row (risk category, or a dedicated row for conflicts / gaps). */
  group: string;
  subtitle: string;
  description?: string;
  recommendation?: string;
  citations: CitationLike[];
}

const KIND_ICON: Record<FindingKind, LucideIcon> = {
  risk: ShieldAlert,
  conflict: GitCompareArrows,
  gap: ShieldX,
};

const CONFLICT_GROUP = 'Cross-clause conflicts';
const GAP_GROUP = 'Missing protections';

function collectFindings({ risks, conflicts, gaps }: Pick<PartialAnalysis, 'risks' | 'conflicts' | 'gaps'>): Finding[] {
  const findings: Finding[] = [];

  compact(risks).forEach((risk, index) => {
    if (!risk.title || !risk.severity) return;
    const category = humanize(risk.category ?? 'other');
    findings.push({
      key: `risk-${index}`,
      kind: 'risk',
      title: risk.title,
      severity: risk.severity,
      group: category,
      subtitle: `Clause risk · ${category}`,
      description: risk.description,
      recommendation: risk.recommendation,
      citations: compact(risk.citations),
    });
  });

  compact(conflicts).forEach((conflict, index) => {
    if (!conflict.title || !conflict.severity) return;
    findings.push({
      key: `conflict-${index}`,
      kind: 'conflict',
      title: conflict.title,
      severity: conflict.severity,
      group: CONFLICT_GROUP,
      subtitle: 'Cross-clause conflict',
      description: conflict.description,
      recommendation: conflict.resolution,
      citations: compact(conflict.citations),
    });
  });

  compact(gaps).forEach((gap, index) => {
    if (!gap.title || !gap.severity) return;
    findings.push({
      key: `gap-${index}`,
      kind: 'gap',
      title: gap.title,
      severity: gap.severity,
      group: GAP_GROUP,
      subtitle: `Missing protection · ${humanize(gap.category ?? 'other')}`,
      description: gap.description,
      recommendation: gap.recommendation,
      citations: [],
    });
  });

  // Stable sort: severity first, original model order (most severe first) within a level.
  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

interface Filter {
  group: string | null;
  severity: Severity | null;
}

export function RiskMatrix({
  risks,
  conflicts,
  gaps,
  streaming,
}: Pick<PartialAnalysis, 'risks' | 'conflicts' | 'gaps'> & { streaming: boolean }) {
  const [filter, setFilter] = useState<Filter>({ group: null, severity: null });

  const findings = useMemo(() => collectFindings({ risks, conflicts, gaps }), [risks, conflicts, gaps]);

  const totals = useMemo(() => {
    const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const finding of findings) counts[finding.severity] += 1;
    return counts;
  }, [findings]);

  const matrix = useMemo(() => {
    const rows = new Map<string, Record<Severity, number>>();
    for (const finding of findings) {
      const row = rows.get(finding.group) ?? { high: 0, medium: 0, low: 0 };
      row[finding.severity] += 1;
      rows.set(finding.group, row);
    }
    return [...rows.entries()]
      .map(([group, counts]) => ({ group, counts, weight: counts.high * 100 + counts.medium * 10 + counts.low }))
      .sort((a, b) => b.weight - a.weight);
  }, [findings]);

  const visible = findings.filter(
    (finding) =>
      (!filter.group || finding.group === filter.group) && (!filter.severity || finding.severity === filter.severity),
  );

  const toggleCell = (group: string | null, severity: Severity | null) =>
    setFilter((current) =>
      current.group === group && current.severity === severity ? { group: null, severity: null } : { group, severity },
    );

  if (findings.length === 0) {
    return streaming ? <PanelSkeleton rows={5} /> : <EmptyHint>No risks were identified in this bundle.</EmptyHint>;
  }

  return (
    <div className="space-y-5">
      {/* Severity totals double as quick filters */}
      <div className="grid grid-cols-3 gap-2">
        {SEVERITY_ORDER.map((severity) => {
          const active = filter.severity === severity && filter.group === null;
          return (
            <button
              key={severity}
              type="button"
              aria-pressed={active}
              onClick={() => toggleCell(null, severity)}
              className={cn(
                'rounded-xl border p-3 text-left transition',
                active ? 'border-white/20 bg-white/[0.07]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]',
              )}
            >
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400">
                <span className={cn('size-2 rounded-full', SEVERITY_STYLES[severity].dot)} />
                {SEVERITY_STYLES[severity].label}
              </span>
              <span className={cn('mt-1 block text-2xl font-semibold tabular-nums', SEVERITY_STYLES[severity].text)}>
                {totals[severity]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Category × severity heat matrix */}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-xs">
          <caption className="sr-only">Risk matrix by category and severity</caption>
          <thead>
            <tr className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Category
              </th>
              {SEVERITY_ORDER.map((severity) => (
                <th key={severity} scope="col" className="w-20 px-2 py-2 text-center font-medium">
                  {SEVERITY_STYLES[severity].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {matrix.map(({ group, counts }) => (
              <tr key={group} className={cn(filter.group === group && 'bg-white/[0.04]')}>
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <button
                    type="button"
                    onClick={() => toggleCell(group, null)}
                    className="text-slate-300 transition hover:text-white"
                  >
                    {group}
                  </button>
                </th>
                {SEVERITY_ORDER.map((severity) => {
                  const count = counts[severity];
                  const selected = filter.group === group && filter.severity === severity;
                  return (
                    <td key={severity} className="px-2 py-1.5">
                      <button
                        type="button"
                        disabled={count === 0}
                        onClick={() => toggleCell(group, severity)}
                        aria-label={`${count} ${SEVERITY_STYLES[severity].label} findings in ${group}`}
                        className={cn(
                          'grid h-7 w-full place-items-center rounded-md font-semibold tabular-nums transition',
                          count === 0
                            ? 'text-slate-700'
                            : cn(
                                SEVERITY_STYLES[severity].heat[Math.min(count, 3) - 1],
                                SEVERITY_STYLES[severity].text,
                                'hover:ring-1 hover:ring-white/20',
                              ),
                          selected && 'ring-1 ring-white/50',
                        )}
                      >
                        {count || '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(filter.group || filter.severity) && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Showing {visible.length} of {findings.length}
            {filter.severity ? ` · ${SEVERITY_STYLES[filter.severity].label}` : ''}
            {filter.group ? ` · ${filter.group}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setFilter({ group: null, severity: null })}
            className="text-indigo-300 transition hover:text-indigo-200"
          >
            Clear filter
          </button>
        </div>
      )}

      <motion.ul layout className="space-y-2">
        <AnimatePresence initial={false}>
          {visible.map((finding) => (
            <FindingCard key={finding.key} finding={finding} />
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(finding.severity === 'high');
  const KindIcon = KIND_ICON[finding.kind];

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-white/[0.02]"
      >
        <SeverityBadge severity={finding.severity} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{finding.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
            <KindIcon className="size-3" />
            {finding.subtitle}
          </p>
        </div>
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pb-3">
              {finding.description && <p className="text-sm leading-relaxed text-slate-300">{finding.description}</p>}
              {finding.recommendation && (
                <div className="rounded-lg border border-indigo-400/15 bg-indigo-400/5 px-3 py-2 text-xs leading-relaxed text-indigo-100">
                  <span className="font-semibold text-indigo-300">
                    {finding.kind === 'conflict' ? 'Resolution' : 'Recommendation'} ·{' '}
                  </span>
                  {finding.recommendation}
                </div>
              )}
              <CitationList citations={finding.citations} connector={finding.kind === 'conflict' ? '↔' : undefined} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
