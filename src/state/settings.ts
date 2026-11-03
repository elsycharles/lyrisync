import { useCallback, useState } from 'react';
import type { Lang } from '../i18n/messages';
import { detectLyricsLanguage } from '../lib/language';
import type { LanguageChoice, ModelSize, WhisperLanguage } from '../worker/models';

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

export interface ResolvedLanguage {
  language: WhisperLanguage;
  /** How it was decided: picked by the user, read from the lyrics, or a fallback. */
  from: 'user' | 'lyrics' | 'fallback';
}

/**
 * The language passed to Whisper. "Auto" reads it from the lyrics; if they give no
 * clear answer, the interface language is used.
 */
export function resolveLanguage(choice: LanguageChoice, lyrics: string, uiLang: Lang): ResolvedLanguage {
  if (choice !== 'auto') return { language: choice, from: 'user' };
  const detected = detectLyricsLanguage(lyrics);
  if (detected) return { language: detected, from: 'lyrics' };
  return { language: uiLang, from: 'fallback' };
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
