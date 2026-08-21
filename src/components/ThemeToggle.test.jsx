import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';
import { useTheme, THEMES } from '../lib/useTheme';

function Harness() {
  const { theme, selectTheme } = useTheme();
  return (
    <>
      <ThemeToggle theme={theme} selectTheme={selectTheme} />
      <span data-testid="current">{theme}</span>
    </>
  );
}

const sw = () => screen.getByRole('switch');

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

test('defaults to dark (Signal Desk) and stamps it on <html>', () => {
  render(<Harness />);
  expect(screen.getByTestId('current')).toHaveTextContent('dark');
  expect(sw()).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe('dark');
});

test('one switch carries the whole choice, with no visible text', () => {
  render(<Harness />);
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  expect(sw()).toHaveTextContent('');
  // No text means the accessible name has to come from the label.
  expect(sw()).toHaveAccessibleName('Dark mode');
});

test('toggling switches theme, and remembers it', () => {
  const { unmount } = render(<Harness />);

  fireEvent.click(sw());
  expect(sw()).not.toBeChecked();
  expect(document.documentElement.dataset.theme).toBe('light');

  unmount();
  render(<Harness />);
  expect(screen.getByTestId('current')).toHaveTextContent('light');
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(sw()).not.toBeChecked();
});

test('toggling back returns to dark', () => {
  render(<Harness />);
  fireEvent.click(sw());
  fireEvent.click(sw());
  expect(sw()).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe('dark');
});

test('the tooltip names the current design and the one it switches to', () => {
  render(<Harness />);
  expect(sw()).toHaveAttribute('title', 'Signal Desk — switch to Blueprint');

  fireEvent.click(sw());
  expect(sw()).toHaveAttribute('title', 'Blueprint — switch to Signal Desk');
});

test('a junk stored value falls back to dark instead of breaking', () => {
  localStorage.setItem('ui.theme.v1', 'chartreuse');
  render(<Harness />);
  expect(screen.getByTestId('current')).toHaveTextContent('dark');
});

test('an unknown theme key is ignored', () => {
  let api;
  function Grab() {
    api = useTheme();
    return null;
  }
  render(<Grab />);
  act(() => api.selectTheme('neon'));
  expect(api.theme).toBe('dark');
  expect(THEMES.map((t) => t.key)).toEqual(['dark', 'light']);
});
