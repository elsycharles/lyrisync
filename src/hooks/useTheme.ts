import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'lyrisync.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The user's explicit choice, if any. An older "system" value counts as no choice. */
function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Light or dark. Until the user picks one, the theme follows the device (and keeps
 * following it if it changes); the toggle then switches between the two and remembers.
 */
export function useTheme() {
  const [stored, setStored] = useState<Theme | null>(readStored);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (stored) root.dataset.theme = stored;
    else delete root.dataset.theme; // tokens.css follows prefers-color-scheme
    try {
      if (stored) localStorage.setItem(STORAGE_KEY, stored);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Not critical.
    }
  }, [stored]);

  const theme = stored ?? system;
  const toggle = useCallback(() => setStored(theme === 'dark' ? 'light' : 'dark'), [theme]);
  return { theme, toggle };
}
