'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { MODEL_STORAGE_KEY } from '@/lib/constants';
import { CLIENT_CONFIG } from '@/lib/config';
import { isLocalModel, type CloudEngineModel, type EngineModel } from '@/lib/engines';
import { getDefaultLocalModel, getLocalModels, isLocalKey } from '@/lib/local/models';
import type { ModelsResponse } from '@/lib/types';

export type CloudStatus = 'loading' | 'ready' | 'error' | 'off';

// ── Persisted choice (localStorage as an external store: null on the server, real value after hydration) ──

const storageListeners = new Set<() => void>();

function subscribeToStorage(listener: () => void): () => void {
  storageListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    storageListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readStoredModel(): string | null {
  try {
    return window.localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredModel(key: string): void {
  try {
    window.localStorage.setItem(MODEL_STORAGE_KEY, key);
  } catch {
    // Storage may be unavailable (private mode) — the choice still applies for this session.
  }
  storageListeners.forEach((listener) => listener());
}

const subscribeNever = () => () => undefined;

/**
 * Merges the built-in on-device catalog with the (optional) server-side cloud catalog and persists
 * the user's choice. On-device models are always available; cloud models appear only when the
 * server has a key. `hydrated` is true once the stored choice is resolved, so nothing (like the
 * auto-download) starts for a model the user already moved away from.
 */
export function useModelSelection() {
  const localModels = useMemo(() => getLocalModels(), []);
  const [cloudModels, setCloudModels] = useState<CloudEngineModel[]>([]);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(CLIENT_CONFIG.cloudFallback ? 'loading' : 'off');

  const stored = useSyncExternalStore(subscribeToStorage, readStoredModel, () => null);
  const isClient = useSyncExternalStore(subscribeNever, () => true, () => false);

  useEffect(() => {
    if (!CLIENT_CONFIG.cloudFallback) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/models', { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load models (HTTP ${res.status})`);
        const data = (await res.json()) as ModelsResponse;
        setCloudModels(data.models.map((model): CloudEngineModel => ({ ...model, kind: 'cloud' })));
        setCloudStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('[DocuLens] Unable to load the cloud model catalog', error);
        setCloudStatus('error');
      }
    })();

    return () => controller.abort();
  }, []);

  const models = useMemo<EngineModel[]>(() => [...localModels, ...cloudModels], [localModels, cloudModels]);

  const activeModel = useMemo<EngineModel>(
    () => models.find((model) => model.key === stored && model.available) ?? getDefaultLocalModel(),
    [models, stored],
  );

  // A stored cloud choice can only be confirmed once the catalog has loaded.
  const hydrated = isClient && (!stored || isLocalKey(stored) || cloudStatus !== 'loading');

  const setModelKey = useCallback((key: string) => writeStoredModel(key), []);

  return { models, modelKey: activeModel.key, activeModel, setModelKey, cloudStatus, hydrated, isLocal: isLocalModel(activeModel) };
}
