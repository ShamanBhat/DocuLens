import type { Analysis, Citation, KeyDateType, RiskCategory, Severity } from '@/lib/ai/schemas';
import type { DocumentPayload, PartialAnalysis } from '@/lib/types';
import type { TextEngine } from './engine';
import { detectGaps } from './gaps';
import { extractJsonObject } from './json';
import type { LocalModelSpec } from './models';
import { buildSummaryMessages, buildWindowMessages } from './prompts';
import { buildWindows, formatPageRange, type AnalysisWindow } from './windows';

/**
 * On-device audit pipeline (map → reduce) for models with small context windows.
 *
 *  1. MAP    — split each document into windows that fit the model; per window, ask for ONE small
 *              JSON object (risks, financials, dates, deliverables). Parse defensively, retry once.
 *  2. GROUND — snap every citation to a real page of the window; keep a quote only if it actually
 *              appears on that page (hallucinated quotes are dropped, not shown).
 *  3. MERGE  — de-duplicate across windows and stream the partial result after every pass.
 *  4. REDUCE — one more pass turns the page notes into the executive summary.
 *  5. GAPS   — deterministic keyword scan for missing protections (no LLM involved).
 *
 * The output has exactly the shape of the cloud audit (`PartialAnalysis`), so the same dashboard renders both.
 */

export interface LocalAnalysisProgress {
  stage: 'scanning' | 'summarising' | 'done';
  done: number;
  total: number;
  /** Windows whose output could not be parsed even after a retry. */
  skipped: number;
  /** True when the bundle exceeded the pass cap and the tail was not analysed. */
  truncated: boolean;
}

export interface LocalAnalysisOptions {
  documents: DocumentPayload[];
  model: LocalModelSpec;
  engine: TextEngine;
  signal: AbortSignal;
  onUpdate: (analysis: PartialAnalysis, progress: LocalAnalysisProgress) => void;
}

export interface LocalAnalysisResult {
  aborted: boolean;
  skipped: number;
  total: number;
}

type Risk = Analysis['risks'][number];
type Term = Analysis['financials']['terms'][number];
type Milestone = Analysis['financials']['milestones'][number];
type KeyDate = Analysis['keyDates'][number];
type Deliverable = Analysis['deliverables'][number];

type RiskDraft = Omit<Risk, 'id'>;

interface WindowResult {
  notes: string;
  risks: RiskDraft[];
  terms: Term[];
  milestones: Milestone[];
  dates: KeyDate[];
  deliverables: Deliverable[];
}

interface SummaryDraft {
  title: string;
  documentType: string;
  parties: { name: string; role: string }[];
  effectiveDate: string | null;
  governingLaw: string | null;
  overview: string;
  intent: string;
  takeaways: string[];
  totalValue: string | null;
  currency: string | null;
}

interface Accumulator {
  notes: { heading: string; range: string; text: string }[];
  risks: RiskDraft[];
  terms: Term[];
  milestones: Milestone[];
  dates: KeyDate[];
  deliverables: Deliverable[];
}

const SEVERITIES: readonly Severity[] = ['high', 'medium', 'low'];
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const CATEGORIES: readonly RiskCategory[] = [
  'liability',
  'indemnification',
  'termination',
  'payment',
  'intellectual_property',
  'confidentiality',
  'data_protection',
  'compliance',
  'warranty',
  'service_levels',
  'dispute_resolution',
  'assignment',
  'ambiguity',
  'other',
];
const DATE_TYPES: readonly KeyDateType[] = ['effective', 'expiration', 'renewal', 'notice', 'payment', 'deliverable', 'other'];

const MAX_CITATIONS_PER_ITEM = 3;
const MAX_ITEMS_PER_WINDOW = 8;

// ── Lenient field readers ────────────────────────────────────────────────────

function text(value: unknown, max = 500): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, max);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function nullable(value: unknown, max = 200): string | null {
  return text(value, max) || null;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .slice(0, MAX_ITEMS_PER_WINDOW);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  const normalized = text(value, 60).toLowerCase().replace(/[\s-]+/g, '_');
  return options.find((option) => option === normalized) ?? fallback;
}

function pageNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const LOOKS_LIKE_DATE =
  /\d{4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{1,2}[/.-]\d{1,2}\b|\bwithin\b|\bdays?\b/i;

// ── Grounding ────────────────────────────────────────────────────────────────

function createGrounder(window: AnalysisWindow) {
  const pages = window.pages.map((page) => ({ page: page.page, normalized: normalizeForMatch(page.text) }));

  return (pageValue: unknown, quoteValue: unknown): Citation => {
    const quote = text(quoteValue, 300);
    const needle = normalizeForMatch(quote);

    // A quote that really appears on a page is the strongest evidence — trust it over the model's page number.
    if (needle.length >= 8) {
      const hit = pages.find((page) => page.normalized.includes(needle));
      if (hit) return { documentId: window.documentId, page: hit.page, section: null, quote };
    }

    const claimed = pageNumber(pageValue);
    const valid = claimed !== null && pages.some((page) => page.page === claimed);
    return { documentId: window.documentId, page: valid ? claimed : window.startPage, section: null, quote: '' };
  };
}

// ── Window result normalisation ──────────────────────────────────────────────

function normalizeWindowResult(raw: Record<string, unknown>, window: AnalysisWindow): WindowResult {
  const ground = createGrounder(window);

  const risks: RiskDraft[] = [];
  for (const item of records(raw.risks)) {
    const title = text(item.title, 120);
    if (!title) continue;
    risks.push({
      title,
      severity: oneOf(item.severity, SEVERITIES, 'medium'),
      category: oneOf(item.category, CATEGORIES, 'other'),
      description: text(item.issue ?? item.description, 600) || 'No explanation was returned for this finding.',
      recommendation: text(item.fix ?? item.recommendation, 400) || 'Review this clause with counsel.',
      citations: [ground(item.page, item.quote)],
    });
  }

  const terms: Term[] = [];
  const milestones: Milestone[] = [];
  for (const item of records(raw.financials)) {
    const label = text(item.label, 120);
    const amount = text(item.amount, 80);
    if (!label || !amount) continue;

    const citations = [ground(item.page, item.quote)];
    const when = text(item.when, 120);
    if (when) {
      const isDate = LOOKS_LIKE_DATE.test(when);
      milestones.push({ name: label, amount, dueDate: isDate ? when : null, trigger: isDate ? label : when, citations });
    } else {
      terms.push({ label, amount, frequency: null, notes: null, citations });
    }
  }

  const dates: KeyDate[] = [];
  for (const item of records(raw.dates)) {
    const label = text(item.label, 120);
    const date = text(item.date, 80);
    if (!label || !date) continue;
    dates.push({ label, date, type: oneOf(item.type, DATE_TYPES, 'other'), citations: [ground(item.page, item.quote)] });
  }

  const deliverables: Deliverable[] = [];
  for (const item of records(raw.deliverables)) {
    const name = text(item.name, 160);
    if (!name) continue;
    deliverables.push({
      name,
      owner: nullable(item.owner),
      dueDate: nullable(item.due),
      acceptanceCriteria: null,
      citations: [ground(item.page, item.quote)],
    });
  }

  return { notes: text(raw.notes, 300), risks, terms, milestones, dates, deliverables };
}

// ── Merging ──────────────────────────────────────────────────────────────────

function keyOf(...parts: string[]): string {
  return normalizeForMatch(parts.join(' '));
}

function mergeCitations(target: Citation[], incoming: Citation[]): void {
  for (const citation of incoming) {
    if (target.length >= MAX_CITATIONS_PER_ITEM) return;
    const duplicate = target.some((c) => c.documentId === citation.documentId && c.page === citation.page);
    if (!duplicate) target.push(citation);
  }
}

function mergeUnique<T extends { citations: Citation[] }>(
  target: T[],
  incoming: T[],
  key: (item: T) => string,
  onDuplicate?: (existing: T, item: T) => void,
): void {
  for (const item of incoming) {
    const existing = target.find((candidate) => key(candidate) === key(item));
    if (existing) {
      mergeCitations(existing.citations, item.citations);
      onDuplicate?.(existing, item);
    } else {
      target.push(item);
    }
  }
}

function merge(acc: Accumulator, result: WindowResult, window: AnalysisWindow): void {
  if (result.notes) {
    acc.notes.push({ heading: window.documentName, range: formatPageRange(window), text: result.notes });
  }
  mergeUnique(acc.risks, result.risks, (r) => keyOf(r.title), (existing, risk) => {
    if (SEVERITY_RANK[risk.severity] < SEVERITY_RANK[existing.severity]) existing.severity = risk.severity;
  });
  mergeUnique(acc.terms, result.terms, (t) => keyOf(t.label, t.amount));
  mergeUnique(acc.milestones, result.milestones, (m) => keyOf(m.name, m.amount ?? ''));
  mergeUnique(acc.dates, result.dates, (d) => keyOf(d.label, d.date));
  mergeUnique(acc.deliverables, result.deliverables, (d) => keyOf(d.name));
}

// ── Output assembly ──────────────────────────────────────────────────────────

/** Heuristic, not a legal opinion: a weighted count of findings, capped at 100. */
function riskScore(risks: RiskDraft[]): number {
  const weights: Record<Severity, number> = { high: 14, medium: 6, low: 2 };
  return Math.min(100, risks.reduce((sum, risk) => sum + weights[risk.severity], 0));
}

function fallbackSummary(acc: Accumulator, documents: DocumentPayload[]): SummaryDraft {
  const pages = documents.reduce((sum, doc) => sum + doc.pages.length, 0);
  const high = acc.risks.filter((risk) => risk.severity === 'high').length;
  return {
    title: documents.map((doc) => doc.name).join(' + '),
    documentType: 'Document bundle',
    parties: [],
    effectiveDate: null,
    governingLaw: null,
    overview: `Scanned ${pages} page${pages === 1 ? '' : 's'} across ${documents.length} document${documents.length === 1 ? '' : 's'} on this device. Found ${acc.risks.length} potential risk${acc.risks.length === 1 ? '' : 's'} (${high} high), ${acc.terms.length + acc.milestones.length} financial item${acc.terms.length + acc.milestones.length === 1 ? '' : 's'} and ${acc.dates.length} key date${acc.dates.length === 1 ? '' : 's'}. The on-device model could not write a narrative summary — review the findings below.`,
    intent: '',
    takeaways: [],
    totalValue: null,
    currency: null,
  };
}

function buildPartial(
  acc: Accumulator,
  documents: DocumentPayload[],
  summary: SummaryDraft | null,
  gaps: Analysis['gaps'],
): PartialAnalysis {
  const risks: Risk[] = acc.risks
    .map((risk, index) => ({ risk, index }))
    .sort((a, b) => SEVERITY_RANK[a.risk.severity] - SEVERITY_RANK[b.risk.severity] || a.index - b.index)
    .map(({ risk }, index) => ({ ...risk, id: `R${index + 1}` }));

  return {
    summary: {
      title: summary?.title || documents.map((doc) => doc.name).join(' + '),
      documentType: summary?.documentType,
      parties: summary?.parties,
      effectiveDate: summary?.effectiveDate,
      governingLaw: summary?.governingLaw,
      overview: summary?.overview,
      intent: summary?.intent,
      structure: acc.notes.map((note) => ({ heading: note.heading, purpose: note.text, pages: note.range })),
      keyTakeaways: summary?.takeaways ?? [],
      riskScore: riskScore(acc.risks),
    },
    risks,
    // Cross-clause conflict detection needs the whole bundle in context — cloud models only.
    conflicts: [],
    gaps,
    financials: {
      currency: summary?.currency ?? null,
      totalValue: summary?.totalValue ?? null,
      terms: acc.terms,
      milestones: acc.milestones,
    },
    keyDates: acc.dates,
    deliverables: acc.deliverables,
  };
}

// ── Model passes ─────────────────────────────────────────────────────────────

async function analyzeWindow(
  engine: TextEngine,
  model: LocalModelSpec,
  window: AnalysisWindow,
  signal: AbortSignal,
): Promise<WindowResult | null> {
  const messages = buildWindowMessages(window);

  for (const attempt of [0, 1]) {
    const output = await engine.generate({
      messages,
      maxNewTokens: Math.min(model.maxOutputTokens, 900),
      // A little sampling on the retry breaks deterministic repeat failures.
      temperature: attempt === 0 ? 0 : 0.3,
      repetitionPenalty: 1.05,
      signal,
    });
    if (output.interrupted || signal.aborted) return null;

    const json = extractJsonObject(output.text);
    if (json) return normalizeWindowResult(json, window);
  }
  return null;
}

function normalizeSummary(raw: Record<string, unknown>, fallback: SummaryDraft): SummaryDraft {
  const parties = records(raw.parties)
    .map((party) => ({ name: text(party.name, 120), role: text(party.role, 60) || 'Party' }))
    .filter((party) => party.name);
  const takeaways = Array.isArray(raw.takeaways)
    ? raw.takeaways.map((item) => text(item, 240)).filter(Boolean).slice(0, 6)
    : [];
  const overview = text(raw.overview, 1_200);

  return {
    title: text(raw.title, 160) || fallback.title,
    documentType: text(raw.documentType, 120) || fallback.documentType,
    parties,
    effectiveDate: nullable(raw.effectiveDate),
    governingLaw: nullable(raw.governingLaw),
    overview: overview || fallback.overview,
    intent: text(raw.intent, 800),
    takeaways,
    totalValue: nullable(raw.totalValue),
    currency: nullable(raw.currency, 12),
  };
}

async function summarise(
  engine: TextEngine,
  model: LocalModelSpec,
  acc: Accumulator,
  documents: DocumentPayload[],
  signal: AbortSignal,
): Promise<SummaryDraft> {
  const fallback = fallbackSummary(acc, documents);
  if (acc.notes.length === 0) return fallback;

  // Reserve room for the system prompt, opening pages and the answer inside the model's pass budget.
  const noteChars = Math.max(2_000, Math.floor(model.promptBudget * 4 * 0.55));
  const output = await engine.generate({
    messages: buildSummaryMessages(acc.notes, documents, noteChars),
    maxNewTokens: Math.min(model.maxOutputTokens, 700),
    temperature: 0,
    repetitionPenalty: 1.05,
    signal,
  });
  if (output.interrupted || signal.aborted) return fallback;

  const json = extractJsonObject(output.text);
  return json ? normalizeSummary(json, fallback) : fallback;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function runLocalAnalysis({
  documents,
  model,
  engine,
  signal,
  onUpdate,
}: LocalAnalysisOptions): Promise<LocalAnalysisResult> {
  const { windows, truncated } = buildWindows(documents, model.promptBudget);
  if (windows.length === 0) {
    throw new Error('No extractable text was found. Scanned or image-only PDFs need OCR before they can be audited.');
  }

  const fullText = documents.flatMap((doc) => doc.pages.map((page) => page.text)).join('\n');
  const pageCount = documents.reduce((sum, doc) => sum + doc.pages.length, 0);
  const gaps = detectGaps(fullText, pageCount);

  const acc: Accumulator = { notes: [], risks: [], terms: [], milestones: [], dates: [], deliverables: [] };
  let skipped = 0;

  const emit = (stage: LocalAnalysisProgress['stage'], done: number, summary: SummaryDraft | null) =>
    onUpdate(buildPartial(acc, documents, summary, gaps), { stage, done, total: windows.length, skipped, truncated });

  emit('scanning', 0, null);

  for (const [index, window] of windows.entries()) {
    const result = await analyzeWindow(engine, model, window, signal);
    if (signal.aborted) return { aborted: true, skipped, total: windows.length };

    if (result) merge(acc, result, window);
    else skipped += 1;
    emit('scanning', index + 1, null);
  }

  emit('summarising', windows.length, null);
  const summary = await summarise(engine, model, acc, documents, signal);
  if (signal.aborted) return { aborted: true, skipped, total: windows.length };

  emit('done', windows.length, summary);
  return { aborted: false, skipped, total: windows.length };
}
