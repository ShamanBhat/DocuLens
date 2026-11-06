/**
 * POST /api/analyze
 *
 * Model-agnostic deep audit. The client sends page-anchored document text plus a runtime
 * model key (`provider:model-id`). The route resolves the provider dynamically — user
 * selection first, then `DOCULENS_DEFAULT_MODEL`, then the first configured provider —
 * and streams a schema-validated audit object back with `streamObject`.
 *
 * Body: { modelKey?: string | null, documents: DocumentPayload[] }
 * Response: text stream of partial JSON consumed by `useObject` on the client.
 */
import { streamObject } from 'ai';
import { z } from 'zod';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from '@/lib/ai/prompts';
import { analysisSchema } from '@/lib/ai/schemas';
import {
  documentsSchema,
  modelKeySchema,
  parseJsonRequest,
  planOutputBudget,
  resolveModelForRequest,
} from '@/lib/server/api-utils';

export const runtime = 'nodejs';

// Long-context audits of large bundles can take minutes; streaming keeps the connection alive.
export const maxDuration = 300;

/** Upper bound for the structured report; clamped further by model limits and remaining context. */
const ANALYSIS_OUTPUT_TOKENS = 32_000;

const requestSchema = z.object({
  modelKey: modelKeySchema,
  documents: documentsSchema,
});

export async function POST(req: Request): Promise<Response> {
  const body = await parseJsonRequest(req, requestSchema);
  if (!body.ok) return body.response;
  const { modelKey, documents } = body.data;

  // Dynamic provider initialization: the same code path serves Claude, GPT, Gemini, …
  const resolved = resolveModelForRequest(modelKey);
  if (!resolved.ok) return resolved.response;
  const { model, spec } = resolved;

  const prompt = buildAnalysisPrompt(documents);
  const budget = planOutputBudget(ANALYSIS_SYSTEM_PROMPT.length + prompt.length, spec, ANALYSIS_OUTPUT_TOKENS);
  if (!budget.ok) return budget.response;

  const result = streamObject({
    model,
    schema: analysisSchema,
    schemaName: 'DocuLensAudit',
    schemaDescription: 'Structured, citation-grounded audit of a document bundle.',
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: budget.maxOutputTokens,
    // Propagate client cancellation (Stop button) upstream so no tokens are wasted.
    abortSignal: req.signal,
    onError: ({ error }) => {
      console.error(`[DocuLens] analyze failed (${spec.key})`, error);
    },
  });

  return result.toTextStreamResponse({
    headers: { 'Cache-Control': 'no-store', 'X-DocuLens-Model': spec.key },
  });
}
