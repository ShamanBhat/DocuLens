'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runLocalAnalysis, type LocalAnalysisProgress } from '@/lib/local/analysis';
import { getLocalEngine } from '@/lib/local/engine';
import type { LocalModelSpec } from '@/lib/local/models';
import type { DocumentPayload, PartialAnalysis } from '@/lib/types';

/**
 * On-device counterpart of `useObject`: same `{ object, isLoading, error, stop }` surface, so the
 * dashboard renders local and cloud audits through one code path. Results stream in after every pass.
 */
export function useLocalAnalysis() {
  const [object, setObject] = useState<PartialAnalysis | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [waitingForModel, setWaitingForModel] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [progress, setProgress] = useState<LocalAnalysisProgress | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async (documents: DocumentPayload[], model: LocalModelSpec) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setObject(undefined);
    setError(undefined);
    setProgress(null);
    setIsLoading(true);
    setWaitingForModel(true);

    try {
      const engine = getLocalEngine();
      await engine.load(model); // first run: waits for the download shown in the overlay
      if (controller.signal.aborted) return;
      setWaitingForModel(false);

      await runLocalAnalysis({
        documents,
        model,
        engine,
        signal: controller.signal,
        onUpdate: (analysis, update) => {
          if (controller.signal.aborted) return;
          setObject(analysis);
          setProgress(update);
        },
      });
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsLoading(false);
        setWaitingForModel(false);
      }
    }
  }, []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  // Leaving the page (or resetting the bundle) must not leave the GPU busy with a stale audit.
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { object, isLoading, waitingForModel, error, progress, run, stop };
}
