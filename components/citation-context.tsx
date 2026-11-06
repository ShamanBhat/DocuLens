'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CitationTarget } from '@/lib/types';

export interface CitationNavigator {
  /** Opens the cited document/page in the viewer and highlights the quote when present. */
  navigate: (target: CitationTarget) => void;
  documentName: (documentId: string) => string | undefined;
}

const CitationContext = createContext<CitationNavigator | null>(null);

export function CitationProvider({ value, children }: { value: CitationNavigator; children: ReactNode }) {
  return <CitationContext.Provider value={value}>{children}</CitationContext.Provider>;
}

export function useCitationNavigator(): CitationNavigator {
  const context = useContext(CitationContext);
  if (!context) throw new Error('useCitationNavigator must be used inside <CitationProvider>.');
  return context;
}
