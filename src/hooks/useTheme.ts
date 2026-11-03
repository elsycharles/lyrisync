import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'lyrisync.theme';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // ignore
  }
  return 'system';
}

/** Theme follows the OS by default; the user can pin light or dark. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!);
  }, []);

  return { theme, cycle };
}
