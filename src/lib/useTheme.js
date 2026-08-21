import { useCallback, useEffect, useState } from 'react';

/**
 * Two designed themes, not an inversion of one:
 *   dark  → Signal Desk  (teal-black console, mint reads, amber writes)
 *   light → Blueprint    (drafting paper, engineering blue, teal/rust)
 *
 * The choice is written to `data-theme` on <html>, which is what the token
 * blocks in index.css switch on, and remembered across sessions.
 */
export const THEMES = [
  { key: 'dark', label: 'Dark', name: 'Signal Desk' },
  { key: 'light', label: 'Light', name: 'Blueprint' },
];

const STORAGE_KEY = 'ui.theme.v1';
const DEFAULT_THEME = 'dark';

function load() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.some((t) => t.key === stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(load);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage blocked: the theme still applies for this session.
    }
  }, [theme]);

  const selectTheme = useCallback((key) => {
    if (THEMES.some((t) => t.key === key)) setTheme(key);
  }, []);

  return { theme, selectTheme };
}
