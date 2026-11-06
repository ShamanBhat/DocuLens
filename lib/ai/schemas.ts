import { z } from 'zod';

/**
 * Unified output contracts. The same Zod schema is enforced on every provider
 * (Anthropic tool mode, OpenAI JSON schema, Gemini response schema) through the
 * AI SDK, so the dashboard renders identical structures whichever model runs.
 *
 * Cross-provider compatibility: every field is required (`.nullable()` instead of
 * `.optional()`), and there are no unions, records or numeric bounds — the lowest
 * common denominator that all major structured-output implementations accept.
 */

export const severitySchema = z
  .enum(['high', 'medium', 'low'])
  .describe(
    'high = material financial/legal exposure or a contradiction that could void protections; medium = unfavourable but bounded, or ambiguous; low = drafting or best-practice issue.',
  );

export const riskCategorySchema = z.enum([
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
]);

export const citationSchema = z.object({
  documentId: z.string().describe('Exact id from the enclosing <document id="..."> tag, e.g. "D1".'),
  page: z
    .number()
    .describe('1-based page number from the enclosing <page number="..."> tag — not printed page labels.'),
  section: z
    .string()
    .nullable()
    .describe('Clause/section reference as written, e.g. "§12.3", "Clause 9(b)", "Schedule 2". Null if none.'),
  quote: z.string().describe('Short verbatim excerpt (max ~25 words) copied exactly from the cited page.'),
});

const citations = z.array(citationSchema).describe('Evidence for this item — at least one citation.');

export const analysisSchema = z.object({
  summary: z.object({
    title: z.string().describe('Concise title for the bundle, e.g. "Acme ↔ Globex Master Services Agreement".'),
    documentType: z.string().describe('e.g. "Master Services Agreement + 2 SOWs", "Commercial Lease", "NDA".'),
    parties: z.array(
      z.object({
        name: z.string(),
        role: z.string().describe('e.g. "Customer", "Supplier", "Licensor".'),
      }),
    ),
    effectiveDate: z.string().nullable().describe('ISO 8601 if determinable, else the stated expression, else null.'),
    governingLaw: z.string().nullable(),
    overview: z.string().describe('Executive summary for a C-level reader, 4–6 sentences.'),
    intent: z
      .string()
      .describe('Commercial intent and high-level architecture of the deal: how the documents and obligations fit together.'),
    structure: z
      .array(
        z.object({
          heading: z.string(),
          purpose: z.string().describe('One sentence on what this part governs.'),
          pages: z.string().describe('Document id and page range, e.g. "D1 p.3–7".'),
        }),
      )
      .describe('Map of the major parts/documents of the bundle in reading order.'),
    keyTakeaways: z.array(z.string()).describe('3–6 points a decision-maker must know.'),
    riskScore: z.number().describe('Overall risk as an integer from 0 (benign) to 100 (critical).'),
  }),

  risks: z
    .array(
      z.object({
        id: z.string().describe('Sequential id: "R1", "R2", …'),
        title: z.string(),
        severity: severitySchema,
        category: riskCategorySchema,
        description: z.string().describe('What the clause says and why it is risky for the reviewing party.'),
        recommendation: z.string().describe('Concrete negotiation or redline recommendation.'),
        citations,
      }),
    )
    .describe('Exhaustive clause-level risk register, most severe first.'),

  conflicts: z
    .array(
      z.object({
        id: z.string().describe('Sequential id: "C1", "C2", …'),
        title: z.string(),
        severity: severitySchema,
        description: z
          .string()
          .describe('Precisely how the provisions contradict or undermine each other, and the practical consequence.'),
        resolution: z.string().describe('How to reconcile the conflict (order-of-precedence clause, redline, …).'),
        citations: z
          .array(citationSchema)
          .describe('At least two citations — one per conflicting provision, typically on non-adjacent pages or in different documents.'),
      }),
    )
    .describe('Contradictions between clauses on non-adjacent pages or across documents in the bundle.'),

  gaps: z
    .array(
      z.object({
        id: z.string().describe('Sequential id: "G1", "G2", …'),
        title: z.string().describe('e.g. "No IP infringement indemnity", "No GDPR Art. 28 processor terms".'),
        severity: severitySchema,
        category: riskCategorySchema,
        description: z.string().describe('Which market-standard protection is missing and the resulting exposure.'),
        recommendation: z.string().describe('Suggested clause to add.'),
      }),
    )
    .describe('Missing indemnities, protections and compliance gaps versus market standard.'),

  financials: z.object({
    currency: z.string().nullable().describe('ISO 4217 code, e.g. "USD". Null if not stated.'),
    totalValue: z
      .string()
      .nullable()
      .describe('Total contract value as stated or derivable, with currency. Null if not determinable.'),
    terms: z.array(
      z.object({
        label: z.string().describe('e.g. "Monthly subscription fee", "Late payment interest", "Liability cap".'),
        amount: z.string().describe('Amount or formula as stated, e.g. "$45,000", "1.5% per month", "12 months of fees".'),
        frequency: z.string().nullable().describe('e.g. "monthly", "one-time", "annual". Null if not applicable.'),
        notes: z.string().nullable(),
        citations,
      }),
    ),
    milestones: z.array(
      z.object({
        name: z.string(),
        amount: z.string().nullable(),
        dueDate: z.string().nullable().describe('ISO 8601 if determinable, otherwise the stated relative expression.'),
        trigger: z.string().describe('Event that triggers payment, e.g. "Acceptance of Phase 1 deliverables".'),
        citations,
      }),
    ),
  }),

  keyDates: z
    .array(
      z.object({
        label: z.string(),
        date: z
          .string()
          .describe('ISO 8601 if determinable, otherwise the stated relative expression, e.g. "90 days before renewal".'),
        type: z.enum(['effective', 'expiration', 'renewal', 'notice', 'payment', 'deliverable', 'other']),
        citations,
      }),
    )
    .describe('Effective, expiration, renewal and notice dates/windows and other deadlines, chronological where possible.'),

  deliverables: z.array(
    z.object({
      name: z.string(),
      owner: z.string().nullable().describe('Responsible party.'),
      dueDate: z.string().nullable(),
      acceptanceCriteria: z.string().nullable(),
      citations,
    }),
  ),
});

export type Analysis = z.infer<typeof analysisSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type Severity = z.infer<typeof severitySchema>;
export type RiskCategory = z.infer<typeof riskCategorySchema>;
export type KeyDateType = Analysis['keyDates'][number]['type'];
