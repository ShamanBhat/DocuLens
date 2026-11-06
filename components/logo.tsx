import { ScanSearch } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-linear-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/30">
        <ScanSearch className="size-4.5 text-white" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-semibold tracking-tight text-white">DocuLens</p>
        <p className="hidden truncate text-[11px] text-slate-500 xl:block">In-browser AI document &amp; contract auditor</p>
      </div>
    </div>
  );
}
