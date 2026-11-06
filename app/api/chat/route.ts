/**
 * POST /api/chat
 *
 * Grounded Q&A over the full document bundle with any configured model. Each turn may
 * use a different model — the conversation history is provider-neutral UI messages.
 *
 * Body: { messages: UIMessage[], modelKey?: string | null, documents: DocumentPayload[] }
 * Response: AI SDK UI message stream (consumed by `useChat`).
 */
import { convertToModelMessages, streamText, type ModelMessage, type UIMessage } from 'ai';
import { z } from 'zod';
import { buildChatSystemPrompt } from '@/lib/ai/prompts';
import {
  documentsSchema,
  jsonError,
  modelKeySchema,
  parseJsonRequest,
  planOutputBudget,
  resolveModelForRequest,
  toPublicErrorMessage,
} from '@/lib/server/api-utils';
import type { ChatMetadata } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_HISTORY_MESSAGES = 24;
const MAX_MESSAGE_CHARACTERS = 8_000;
const CHAT_OUTPUT_TOKENS = 4_096;

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().max(200),
        // Only user/assistant turns are accepted — clients cannot inject system messages.
        role: z.enum(['user', 'assistant']),
        parts: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })).max(200),
      }),
    )
    .min(1)
    .max(500),
  modelKey: modelKeySchema,
  documents: documentsSchema,
});

export async function POST(req: Request): Promise<Response> {
  const body = await parseJsonRequest(req, requestSchema);
  if (!body.ok) return body.response;
  const { messages, modelKey, documents } = body.data;

  // Rebuild history from text parts only: drops forged tool/system parts and keeps prompts lean.
  const history = messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map(({ id, role, parts }) => ({
      id,
      role,
      parts: parts.flatMap((part) =>
        part.type === 'text' && typeof part.text === 'string'
          ? [{ type: 'text' as const, text: part.text.slice(0, MAX_MESSAGE_CHARACTERS) }]
          : [],
      ),
    }))
    .filter((message) => message.parts.length > 0);

  if (history.at(-1)?.role !== 'user') {
    return jsonError('The last message must be a user question.', 400);
  }

  const resolved = resolveModelForRequest(modelKey);
  if (!resolved.ok) return resolved.response;
  const { model, spec } = resolved;

  const system = buildChatSystemPrompt(documents);
  const historyCharacters = history.reduce(
    (total, message) => total + message.parts.reduce((sum, part) => sum + part.text.length, 0),
    0,
  );
  const budget = planOutputBudget(system.length + historyCharacters, spec, CHAT_OUTPUT_TOKENS);
  if (!budget.ok) return budget.response;

  const systemMessage: ModelMessage = {
    role: 'system',
    content: system,
    // Cache the large, stable document prefix on Anthropic (OpenAI & Gemini cache stable prefixes automatically).
    providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
  };

  const uiMessages: UIMessage[] = history;

  const result = streamText({
    model,
    messages: [systemMessage, ...(await convertToModelMessages(uiMessages))],
    maxOutputTokens: budget.maxOutputTokens,
    abortSignal: req.signal,
    onError: ({ error }) => {
      console.error(`[DocuLens] chat failed (${spec.key})`, error);
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { 'Cache-Control': 'no-store' },
    messageMetadata: ({ part }): ChatMetadata | undefined => {
      if (part.type === 'start') return { model: spec.label, modelKey: spec.key };
      if (part.type === 'finish') {
        return { model: spec.label, modelKey: spec.key, totalTokens: part.totalUsage.totalTokens };
      }
      return undefined;
    },
    onError: toPublicErrorMessage,
  });
}
