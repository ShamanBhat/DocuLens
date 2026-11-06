import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Severity } from '@/lib/ai/schemas';
import { cn } from '@/lib/utils';

export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];

export const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Static class strings (Tailwind can only detect complete class names). */
export const SEVERITY_STYLES: Record<
  Severity,
  { label: string; badge: string; dot: string; text: string; heat: [string, string, string] }
> = {
  high: {
    label: 'High',
    badge: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
    dot: 'bg-rose-400',
    text: 'text-rose-300',
    heat: ['bg-rose-500/15', 'bg-rose-500/30', 'bg-rose-500/50'],
  },
  medium: {
    label: 'Medium',
    badge: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    heat: ['bg-amber-500/15', 'bg-amber-500/30', 'bg-amber-500/50'],
  },
  low: {
    label: 'Low',
    badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    heat: ['bg-emerald-500/15', 'bg-emerald-500/30', 'bg-emerald-500/50'],
  },
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const style = SEVERITY_STYLES[severity];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        style.badge,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-white/[0.06]', className)} />;
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-16 w-full', i % 2 === 1 && 'h-12 w-11/12')} />
      ))}
    </div>
  );
}

export function Section({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <Icon className="size-3.5 text-indigo-300" />
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
      {children}
    </p>
  );
}

export function PanelLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
      <LoaderCircle className="size-4 animate-spin" />
      {label}
    </div>
  );
}
