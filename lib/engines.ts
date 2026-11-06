import type { ModelOption } from '@/lib/ai/models';
import type { LocalModelSpec } from '@/lib/local/models';

/** A model the user can pick: running on this device, or behind a cloud API. */
export type CloudEngineModel = ModelOption & { kind: 'cloud' };
export type EngineModel = LocalModelSpec | CloudEngineModel;

export function isLocalModel(model: EngineModel | null | undefined): model is LocalModelSpec {
  return model?.kind === 'local';
}

export function isCloudModel(model: EngineModel | null | undefined): model is CloudEngineModel {
  return model?.kind === 'cloud';
}
