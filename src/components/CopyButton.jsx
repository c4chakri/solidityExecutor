import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Copies `value` to the clipboard, with a fallback for non-secure contexts. */
async function writeToClipboard(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  // http:// origins have no Clipboard API; fall back to a detached textarea.
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  try {
    if (!document.execCommand('copy')) throw new Error('copy command rejected');
  } finally {
    document.body.removeChild(field);
  }
}

export default function CopyButton({ value, label = 'value' }) {
  const [state, setState] = useState('idle');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    if (!value) return;
    try {
      await writeToClipboard(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  }, [value]);

  const title = { idle: `Copy ${label}`, copied: 'Copied', failed: 'Copy failed' }[state];

  return (
    <button
      type="button"
      className={`copy-btn${state === 'copied' ? ' copied' : ''}`}
      onClick={copy}
      disabled={!value}
      title={title}
      aria-label={title}
    >
      {state === 'copied' ? '✓' : '⧉'}
    </button>
  );
}
