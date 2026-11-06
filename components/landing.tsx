'use client';

import { motion } from 'framer-motion';
import { GitCompareArrows, KeyRound, Layers, Lock, Quote, Sparkles, type LucideIcon } from 'lucide-react';
import type { IngestProgress } from '@/hooks/use-document-bundle';
import { TAGLINE } from '@/lib/constants';
import { UploadDropzone } from './upload-dropzone';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Layers,
    title: 'Full-context deep audit',
    body: 'Whole bundles go to the model in one pass — no lossy chunking — and a strict Zod schema makes Claude, GPT and Gemini return the same structured report.',
  },
  {
    icon: GitCompareArrows,
    title: 'Cross-clause conflict detection',
    body: 'Surfaces contradictions between distant pages and documents, missing indemnities and compliance gaps in a severity-ranked risk matrix.',
  },
  {
    icon: Quote,
    title: 'Grounded, cited Q&A',
    body: 'Every answer cites document, page and section. Click a citation to jump straight to the highlighted source.',
  },
];

interface LandingProps {
  onFiles: (files: File[]) => void;
  ingest: IngestProgress | null;
  noProviders: boolean;
  modelsError: boolean;
}

export function Landing({ onFiles, ingest, noProviders, modelsError }: LandingProps) {
  return (
    <main className="relative flex-1 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.03)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
      />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pb-16 pt-12 sm:pt-20">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-xs text-indigo-200"
        >
          <Sparkles className="size-3.5" />
          Model-agnostic · Claude · GPT · Gemini
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-6 text-center text-4xl font-semibold tracking-tight text-white sm:text-6xl"
        >
          Audit the whole contract.
          <br />
          <span className="bg-linear-to-r from-indigo-300 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
            Not just the chunks.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-5 max-w-2xl text-center text-base text-slate-400 sm:text-lg"
        >
          {TAGLINE}
        </motion.p>

        {(noProviders || modelsError) && (
          <div className="mt-8 flex max-w-2xl items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <p>
              {modelsError ? 'Could not load the model catalog. ' : 'No AI provider is configured. '}
              Copy <code className="font-mono text-amber-200">.env.example</code> to{' '}
              <code className="font-mono text-amber-200">.env.local</code>, add at least one API key, and restart the dev server.
            </p>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-10 w-full max-w-2xl"
        >
          <UploadDropzone onFiles={onFiles} ingest={ingest} />
        </motion.div>

        <div className="mt-14 grid w-full gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.06 }}
              className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-5"
            >
              <div className="grid size-9 place-items-center rounded-lg bg-indigo-500/15 ring-1 ring-indigo-400/20">
                <Icon className="size-4.5 text-indigo-300" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
            </motion.div>
          ))}
        </div>

        <p className="mt-10 flex items-center gap-2 text-center text-xs text-slate-500">
          <Lock className="size-3.5 shrink-0" />
          PDFs are parsed in your browser. Only extracted text is sent to the provider you select — nothing is stored.
        </p>
      </div>
    </main>
  );
}
