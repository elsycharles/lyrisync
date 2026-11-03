import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages, type Lang, type Messages } from './messages';

const STORAGE_KEY = 'lyrisync.lang';

interface I18nValue {
  lang: Lang;
  t: Messages;
  setLang: (lang: Lang) => void;
}

export const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
  } catch {
    // Storage can be blocked (private mode); fall through to the browser language.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'fr';
  return nav.startsWith('en') ? 'en' : 'fr';
}

export function I18nProvider({ children, lang: forced }: { children: ReactNode; lang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => forced ?? initialLang());

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not critical.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, t: messages[lang], setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
