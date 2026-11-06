import 'server-only';

import { APICallError, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { ModelSpec } from '@/lib/ai/models';
import { ModelResolutionError, resolveModel } from '@/lib/ai/registry';
import { MAX_DOCUMENTS } from '@/lib/constants';
import { countCharacters, estimateTokens, MIN_OUTPUT_TOKENS } from '@/lib/documents/context';
import { formatTokens } from '@/lib/utils';

type Result<T> = ({ ok: true } & T) | { ok: false; response: Response };

/** Rejects oversized bodies before parsing (~32 MB of extracted text is far beyond any context window). */
const MAX_BODY_BYTES = 32 * 1024 * 1024;

/** Hard ceiling on bundle text (~2M tokens) regardless of the model selected. */
const MAX_BUNDLE_CHARACTERS = 8_000_000;

export const documentsSchema = z
  .array(
    z.object({
      id: z.string().regex(/^D\d{1,3}$/, 'Document ids must look like "D1".'),
      name: z.string().trim().min(1).max(300),
      pages: z
        .array(z.object({ page: z.number().int().positive(), text: z.string() }))
        .min(1)
        .max(10_000),
    }),
  )
  .min(1, 'Upload at least one document.')
  .max(MAX_DOCUMENTS)
  .refine((docs) => countCharacters(docs) <= MAX_BUNDLE_CHARACTERS, 'The document bundle is too large.');

export const modelKeySchema = z.string().trim().max(200).nullish();

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function formatValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request body.';
  const path = issue.path.map(String).join('.');
  return `Invalid request${path ? ` (${path})` : ''}: ${issue.message}`;
}

export async function parseJsonRequest<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<Result<{ data: z.infer<T> }>> {
  const declaredBytes = Number(req.headers.get('content-length') ?? 0);
  if (declaredBytes > MAX_BODY_BYTES) {
    return { ok: false, response: jsonError('Request body is too large.', 413) };
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: jsonError(formatValidationError(parsed.error), 400) };
  }
  return { ok: true, data: parsed.data };
}

/** Resolves the requested (or default) model into an AI SDK LanguageModel, or an HTTP error. */
export function resolveModelForRequest(
  modelKey: string | null | undefined,
): Result<{ model: LanguageModel; spec: ModelSpec }> {
  try {
    return { ok: true, ...resolveModel(modelKey) };
  } catch (error) {
    if (error instanceof ModelResolutionError) {
      return { ok: false, response: jsonError(error.message, error.status) };
    }
    throw error;
  }
}

/**
 * Checks the estimated prompt size against the model's context window and returns a
 * completion budget that fits (some providers reject prompt + max_tokens > context).
 */
export function planOutputBudget(
  promptCharacters: number,
  spec: ModelSpec,
  preferredOutputTokens: number,
): Result<{ maxOutputTokens: number }> {
  const inputTokens = estimateTokens(promptCharacters);
  const room = spec.contextWindow - inputTokens;

  if (room < MIN_OUTPUT_TOKENS) {
    return {
      ok: false,
      response: jsonError(
        `This request is ~${formatTokens(inputTokens)} tokens, which exceeds the ${formatTokens(spec.contextWindow)} context window of ${spec.label}. Switch to a 1M-token model (e.g. Gemini 2.5 Pro or GPT-4.1) or remove documents.`,
        413,
      ),
    };
  }

  return { ok: true, maxOutputTokens: Math.min(preferredOutputTokens, spec.maxOutputTokens, room) };
}

/** Maps provider errors to safe, actionable messages (never leaks raw provider payloads). */
export function toPublicErrorMessage(error: unknown): string {
  if (APICallError.isInstance(error)) {
    switch (error.statusCode) {
      case 401:
      case 403:
        return 'The AI provider rejected the API key. Check your server environment configuration.';
      case 404:
        return 'The selected model was not found at the provider. Check the model id.';
      case 413:
        return 'The request is too large for the selected model.';
      case 429:
        return 'The AI provider rate-limited this request. Wait a moment and retry.';
    }
    if (error.statusCode !== undefined && error.statusCode >= 500) {
      return 'The AI provider is temporarily unavailable. Please retry.';
    }
    if (/context|token|too long/i.test(error.message)) {
      return "The documents exceed the selected model's context window. Choose a longer-context model.";
    }
    return 'The AI provider rejected the request.';
  }
  if (error instanceof Error && error.name === 'AbortError') return 'The request was cancelled.';
  return 'The model failed to complete the request. Please retry.';
}
