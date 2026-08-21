import React from 'react';
import { THEMES } from '../lib/useTheme';

const DARK = THEMES.find((t) => t.key === 'dark');
const LIGHT = THEMES.find((t) => t.key === 'light');

/**
 * A switch, not a pair of labelled buttons — there are only two themes, so one
 * control is enough. It carries no text, so `role="switch"` plus an aria-label
 * are what name it for screen readers and keyboard users.
 */
export default function ThemeToggle({ theme, selectTheme }) {
  const isDark = theme === 'dark';
  const active = isDark ? DARK : LIGHT;

  return (
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark mode"
      title={`${active.name} — switch to ${(isDark ? LIGHT : DARK).name}`}
      onClick={() => selectTheme(isDark ? 'light' : 'dark')}
    >
      <span className="theme-knob" />
    </button>
  );
}
