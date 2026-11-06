'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { CLIENT_CONFIG } from '@/lib/config';
import {
  getEngineSnapshot,
  getLocalEngine,
  IDLE_SNAPSHOT,
  subscribeEngine,
  type EngineSnapshot,
} from '@/lib/local/engine';
import type { LocalModelSpec } from '@/lib/local/models';
import { detectWebGpu, type WebGpuSupport } from '@/lib/local/webgpu';

/** Live state of the on-device engine (phase, download progress, speed, errors). */
export function useLocalEngine(): EngineSnapshot {
  return useSyncExternalStore(subscribeEngine, getEngineSnapshot, () => IDLE_SNAPSHOT);
}

/** `null` until the adapter probe finishes. */
export function useWebGpuSupport(): WebGpuSupport | null {
  const [support, setSupport] = useState<WebGpuSupport | null>(null);

  useEffect(() => {
    let cancelled = false;
    void detectWebGpu().then((result) => {
      if (!cancelled) setSupport(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return support;
}

/** True when the browser asks us to conserve bandwidth (Data Saver). */
export function prefersDataSaving(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * Starts downloading/initialising the selected on-device model as soon as the app opens, so the
 * weights are cached before the user needs them. Skipped in Data Saver mode or when
 * NEXT_PUBLIC_AUTO_DOWNLOAD=off — the overlay then offers an explicit download button.
 */
export function useLocalEngineAutoload(model: LocalModelSpec | null, enabled: boolean): void {
  useEffect(() => {
    if (!model || !enabled || !CLIENT_CONFIG.autoDownload || prefersDataSaving()) return;
    // Failures surface through the engine snapshot (overlay + header badge).
    getLocalEngine()
      .load(model)
      .catch(() => undefined);
  }, [model, enabled]);
}

export function loadLocalModel(model: LocalModelSpec): Promise<void> {
  return getLocalEngine().load(model);
}

export function unloadLocalModel(): void {
  getLocalEngine().unload();
}
