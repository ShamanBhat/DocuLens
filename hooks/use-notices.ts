'use client';

import { useCallback, useRef, useState } from 'react';

export type NoticeTone = 'error' | 'warning' | 'info';

export interface Notice {
  id: number;
  message: string;
  tone: NoticeTone;
}

/** Minimal toast queue (keeps the 4 most recent notices, auto-dismisses). */
export function useNotices(autoDismissMs = 7000) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setNotices((list) => list.filter((notice) => notice.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: NoticeTone = 'info') => {
      counter.current += 1;
      const id = counter.current;
      setNotices((list) => [...list.slice(-3), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), autoDismissMs);
    },
    [autoDismissMs, dismiss],
  );

  return { notices, notify, dismiss };
}
