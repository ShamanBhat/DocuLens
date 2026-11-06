/**
 * GET /api/models
 *
 * Returns the model catalog annotated with availability (based on which provider keys
 * are configured) plus the default model. Never exposes API keys.
 */
import { getDefaultModelKey, listModels } from '@/lib/ai/registry';
import type { ModelsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const models = listModels();
  const body: ModelsResponse = { models, defaultModelKey: getDefaultModelKey(models) };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
