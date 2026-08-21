import React, { useMemo, useRef, useState } from 'react';
import { chainIdToDecimal } from '../lib/networks';

/** Rows put in the DOM at once, however long the filtered list is. */
const RENDER_LIMIT = 50;

function matches(net, query) {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    net.chainName.toLowerCase().includes(needle) ||
    net.chainId.toLowerCase().includes(needle) ||
    chainIdToDecimal(net.chainId).includes(needle)
  );
}

/**
 * Selects the active chain from a scrollable, filterable list.
 *
 * A native <select> is unusable past a few dozen entries — it cannot be
 * searched and renders every option. This keeps the DOM bounded at
 * RENDER_LIMIT rows and narrows by name, decimal or hex chain ID instead.
 */
export default function NetworkPicker({ networks, chainId, disabled, onSelect }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(-1);
  const listRef = useRef(null);

  const all = useMemo(() => Object.values(networks), [networks]);
  const filtered = useMemo(() => all.filter((net) => matches(net, query)), [all, query]);
  const shown = filtered.slice(0, RENDER_LIMIT);
  const hidden = filtered.length - shown.length;

  const choose = (net) => {
    if (disabled || net.chainId === chainId) return;
    onSelect(net.chainId);
  };

  const onKeyDown = (e) => {
    if (shown.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = Math.min(Math.max(cursor + step, 0), shown.length - 1);
      setCursor(nextIndex);
      const row = listRef.current?.children[nextIndex];
      // Not implemented in every environment (jsdom, older webviews).
      row?.scrollIntoView?.({ block: 'nearest' });
    } else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault();
      choose(shown[cursor]);
    }
  };

  return (
    <div className="net-picker">
      <input
        type="search"
        className="net-search"
        placeholder="Search networks"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(-1);
        }}
        onKeyDown={onKeyDown}
        aria-label="Search networks"
      />

      <ul className="net-list" ref={listRef} role="listbox" aria-label="Networks">
        {shown.map((net, i) => (
          <li key={net.chainId}>
            <button
              type="button"
              role="option"
              aria-selected={net.chainId === chainId}
              className={`net-item${net.chainId === chainId ? ' current' : ''}${
                i === cursor ? ' cursor' : ''
              }`}
              disabled={disabled}
              onClick={() => choose(net)}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="net-name">{net.chainName}</span>
              <span className="net-id">{chainIdToDecimal(net.chainId)}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="net-empty">No network matches “{query}”</li>}
      </ul>

      {hidden > 0 && (
        <p className="net-more">{hidden} more — refine your search to narrow the list.</p>
      )}
    </div>
  );
}
