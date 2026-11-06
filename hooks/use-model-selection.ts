'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModelOption } from '@/lib/ai/models';
import { MODEL_STORAGE_KEY } from '@/lib/constants';
import type { ModelsResponse } from '@/lib/types';

export type ModelsStatus = 'loading' | 'ready' | 'error';

function readStoredModel(): string | null {
  try {
    return window.localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Loads the server-side model catalog and persists the user's choice across sessions. */
export function useModelSelection() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelKey, setModelKeyState] = useState<string | null>(null);
  const [status, setStatus] = useState<ModelsStatus>('loading');

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/models', { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load models (HTTP ${res.status})`);
        const data = (await res.json()) as ModelsResponse;

        const stored = readStoredModel();
        const storedIsUsable = data.models.some((m) => m.key === stored && m.available);

        setModels(data.models);
        setModelKeyState(storedIsUsable ? stored : data.defaultModelKey);
        setStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('[DocuLens] Unable to load model catalog', error);
        setStatus('error');
      }
    })();

    return () => controller.abort();
  }, []);

  const setModelKey = useCallback((key: string) => {
    setModelKeyState(key);
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, key);
    } catch {
      // Storage may be unavailable (private mode) — selection still works for this session.
    }
  }, []);

  const activeModel = useMemo(() => models.find((m) => m.key === modelKey) ?? null, [models, modelKey]);

  return { models, modelKey, activeModel, setModelKey, status };
}
