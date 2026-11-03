import { useCallback, useState } from 'react';
import type { LanguageChoice, ModelSize } from '../worker/models';

export interface SyncSettings {
  language: LanguageChoice;
  model: ModelSize;
}

const STORAGE_KEY = 'lyrisync.settings';
const DEFAULTS: SyncSettings = { language: 'auto', model: 'base' };

function read(): SyncSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SyncSettings>;
    return {
      language: ['auto', 'fr', 'en', 'mg'].includes(parsed.language as string)
        ? (parsed.language as LanguageChoice)
        : DEFAULTS.language,
      model: ['tiny', 'base', 'small'].includes(parsed.model as string) ? (parsed.model as ModelSize) : DEFAULTS.model,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setState] = useState<SyncSettings>(read);
  const update = useCallback((patch: Partial<SyncSettings>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Not critical.
      }
      return next;
    });
  }, []);
  return { settings, update };
}
