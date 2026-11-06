'use client';

import { motion } from 'framer-motion';
import { Cpu, GitCompareArrows, Lock, Quote, ShieldCheck, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { IngestProgress } from '@/hooks/use-document-bundle';
import { TAGLINE } from '@/lib/constants';
import type { WebGpuSupport } from '@/lib/local/webgpu';
import { UploadDropzone } from './upload-dropzone';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Cpu,
    title: 'AI that never leaves your tab',
    body: 'A Hugging Face model runs on your GPU through WebGPU inside a Web Worker. It downloads once, is cached by the browser, and then works offline.',
  },
  {
    icon: ShieldCheck,
    title: 'Structured, grounded audit',
    body: 'Executive summary, a High/Medium/Low risk matrix, financials, expiry dates and deliverables — parsed from enforced JSON and tied to real pages.',
  },
  {
    icon: Quote,
    title: 'Cited Q&A, local or cloud',
    body: 'Ask questions and get [D1 p.12] citations that jump to the highlighted source. Prefer a bigger model? Optionally switch to Claude or GPT.',
  },
];

interface LandingProps {
  onFiles: (files: File[]) => void;
  ingest: IngestProgress | null;
  webgpu: WebGpuSupport | null;
}

export function Landing({ onFiles, ingest, webgpu }: LandingProps) {
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
          className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200"
        >
          <Sparkles className="size-3.5" />
          100% local · WebGPU · Hugging Face Transformers.js
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-6 text-center text-4xl font-semibold tracking-tight text-white sm:text-6xl"
        >
          Audit contracts without
          <br />
          <span className="bg-linear-to-r from-emerald-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
            uploading a single page.
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

        {webgpu && !webgpu.supported && (
          <div className="mt-8 flex max-w-2xl items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <p>
              {webgpu.reason ?? 'WebGPU is unavailable.'} For the best speed use Chrome or Edge 113+ on a device with a GPU — or
              add a cloud API key to <code className="font-mono text-amber-200">.env.local</code> and pick a cloud model.
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

        <div className="mt-10 flex max-w-2xl flex-col items-center gap-2 text-center text-xs text-slate-500">
          <p className="flex items-center gap-2">
            <Lock className="size-3.5 shrink-0" />
            PDFs are parsed in your browser and analysed by an on-device model. Nothing is uploaded or stored.
          </p>
          <p className="flex items-center gap-2">
            <GitCompareArrows className="size-3.5 shrink-0" />
            Cloud models are optional; when selected, a badge in the header shows that text leaves your device.
          </p>
        </div>
      </div>
    </main>
  );
}
