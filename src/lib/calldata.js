import { ethers } from 'ethers';
import { namedArgs } from './abiValues';

/**
 * Raw calldata handling: validate what was pasted, and say what it decodes to
 * before it is sent. Encoding mistakes are unrecoverable once mined, so the
 * preview matters more here than anywhere else in the app.
 */

const HEX = /^[0-9a-f]*$/i;

/**
 * Canonicalises pasted calldata to `0x`-prefixed lowercase hex.
 * Throws with a specific reason rather than letting ethers fail later.
 */
export function normalizeCalldata(raw) {
  // Strip whitespace anywhere: pasted hex is often wrapped across lines.
  const text = (raw || '').replace(/\s+/g, '');
  if (!text) throw new Error('Enter the calldata to send');

  const body = text.startsWith('0x') || text.startsWith('0X') ? text.slice(2) : text;
  if (!HEX.test(body)) throw new Error('Calldata must be hexadecimal');
  if (body.length % 2 !== 0) {
    throw new Error(`Calldata must have an even number of hex digits (got ${body.length})`);
  }
  return '0x' + body.toLowerCase();
}

/**
 * Decodes calldata against the ABI so the caller can confirm the target before
 * sending. Returns null when it cannot be matched — which is legitimate for a
 * fallback/receive call, so it is never treated as an error on its own.
 */
export function describeCalldata(abi, data) {
  let hex;
  try {
    hex = normalizeCalldata(data);
  } catch {
    return null;
  }

  if (hex.length < 10) {
    return {
      selector: null,
      name: null,
      signature: null,
      args: null,
      byteLength: (hex.length - 2) / 2,
    };
  }

  const base = { selector: hex.slice(0, 10), byteLength: (hex.length - 2) / 2 };

  let parsed = null;
  try {
    parsed = new ethers.Interface(abi).parseTransaction({ data: hex });
  } catch {
    parsed = null;
  }
  if (!parsed) return { ...base, name: null, signature: null, args: null };

  return {
    ...base,
    name: parsed.name,
    signature: parsed.signature,
    args: namedArgs(parsed.fragment, parsed.args),
  };
}

/** One-line summary of a decoded description, for the preview line. */
export function summariseCalldata(described) {
  if (!described) return null;
  if (!described.name) {
    return described.selector
      ? `${described.selector} — not in this ABI (fallback, or another contract's function)`
      : `${described.byteLength} byte(s) — no function selector (fallback/receive)`;
  }
  const args = Object.entries(described.args || {}).map(([key, value]) => {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `${key}: ${text}`;
  });
  return `${described.name}(${args.join(', ')})`;
}
