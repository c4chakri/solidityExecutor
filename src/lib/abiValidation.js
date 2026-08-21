import { ethers } from 'ethers';
import { rpcCall } from './networks';

/**
 * Validation for the two things the user pastes: a contract address and an ABI.
 *
 * `new ethers.Interface(abi)` is deliberately forgiving — an unparseable
 * fragment is logged and *dropped*, not rejected. A contract would then load
 * missing functions with no explanation, so every fragment is checked
 * individually here and anything rejected is reported by position.
 */

const HUMAN_READABLE = /^\s*(function|event|error|constructor|fallback|receive)\b/;

/** Checks and checksums a contract address. */
export function validateAddress(raw) {
  const text = (raw || '').trim();
  if (!text) throw new Error('Enter the contract address');

  if (!ethers.isAddress(text)) {
    if (text.includes('.')) throw new Error('ENS names are not supported here — paste the address');
    if (/^0x[0-9a-fA-F]{40}$/.test(text)) {
      // Right shape, so the mixed-case checksum is what failed. A typo here
      // would otherwise send a transaction to the wrong contract.
      throw new Error('Address checksum is invalid — re-copy it, or paste it in lowercase');
    }
    if (/^0x[0-9a-fA-F]*$/.test(text)) {
      throw new Error(`An address is 40 hex digits after 0x — this has ${text.length - 2}`);
    }
    throw new Error('That is not a valid contract address');
  }

  const address = ethers.getAddress(text);
  if (address === ethers.ZeroAddress) throw new Error('That is the zero address');
  return address;
}

/** Unwraps the shapes an ABI commonly arrives in. */
function unwrap(parsed) {
  if (Array.isArray(parsed)) return parsed;

  // Hardhat / Foundry / Truffle build artifacts, and raw solc output.
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.abi)) return parsed.abi;
    if (Array.isArray(parsed.output?.abi)) return parsed.output.abi;
    // A single fragment pasted on its own.
    if (typeof parsed.type === 'string') return [parsed];
  }
  throw new Error('An ABI must be a JSON array of fragments (or a build artifact containing one)');
}

function readInput(text) {
  try {
    return unwrap(JSON.parse(text));
  } catch (err) {
    if (err instanceof SyntaxError) {
      // Not JSON — accept human-readable signatures, one per line.
      const lines = text
        .split('\n')
        .map((line) => line.trim().replace(/,\s*$/, ''))
        .filter(Boolean);
      if (lines.length > 0 && lines.every((line) => HUMAN_READABLE.test(line))) return lines;
      throw new Error(`That ABI is not valid JSON: ${err.message}`);
    }
    throw err;
  }
}

function describeFragment(fragment, index) {
  if (typeof fragment === 'string') return `#${index + 1} "${fragment.slice(0, 48)}"`;
  const name = fragment && typeof fragment === 'object' ? fragment.name : null;
  return name ? `#${index + 1} "${name}"` : `#${index + 1}`;
}

/**
 * Parses, validates and normalises pasted ABI text.
 *
 * Returns { abi, warnings }: `abi` is a canonical JSON fragment array (human
 * readable input and legacy `constant` flags are converted), `warnings` are
 * things worth knowing that should not block loading.
 * Throws with a specific reason when the input cannot be used at all.
 */
/**
 * Drops the fields ethers re-adds for pre-0.5 compatibility. `constant` and
 * `payable` are deprecated duplicates of `stateMutability`, and `anonymous`
 * only means something when true — carrying them makes the stored ABI noisier
 * than the one the user pasted.
 */
function tidy(fragment) {
  const { constant, payable, anonymous, ...rest } = fragment;
  return anonymous ? { ...rest, anonymous } : rest;
}

export function parseAbiInput(raw) {
  const text = (raw || '').trim();
  if (!text) throw new Error('Paste the contract ABI');

  const entries = readInput(text);
  if (entries.length === 0) throw new Error('That ABI is empty');

  // Check fragments one by one: the Interface constructor would drop bad ones.
  const rejected = [];
  entries.forEach((fragment, index) => {
    try {
      ethers.Fragment.from(fragment);
    } catch (err) {
      rejected.push(`${describeFragment(fragment, index)}: ${err.shortMessage || err.message}`);
    }
  });
  if (rejected.length > 0) {
    const shown = rejected.slice(0, 3).join('; ');
    const rest = rejected.length > 3 ? ` (+${rejected.length - 3} more)` : '';
    throw new Error(`${rejected.length} ABI fragment(s) are invalid — ${shown}${rest}`);
  }

  let abi;
  try {
    abi = JSON.parse(new ethers.Interface(entries).formatJson()).map(tidy);
  } catch (err) {
    throw new Error(`That ABI could not be loaded: ${err.shortMessage || err.message}`);
  }

  const counts = { function: 0, event: 0, error: 0 };
  for (const fragment of abi) {
    if (fragment.type in counts) counts[fragment.type] += 1;
  }

  const warnings = [];
  if (counts.function === 0) {
    warnings.push('This ABI declares no functions, so there is nothing to call.');
  }
  if (counts.error === 0) {
    warnings.push(
      'No error types in this ABI — a revert can only be reported as a raw selector.'
    );
  }

  const seen = new Set();
  const duplicates = new Set();
  for (const fragment of abi) {
    if (fragment.type !== 'function') continue;
    const key = `${fragment.name}(${(fragment.inputs || []).map((i) => i.type).join(',')})`;
    if (seen.has(key)) duplicates.add(fragment.name);
    seen.add(key);
  }
  if (duplicates.size > 0) {
    warnings.push(`Duplicate function signature(s): ${[...duplicates].join(', ')}.`);
  }

  return { abi, warnings, counts };
}

/**
 * A loaded ABI on one line, e.g.
 *   [{ "type": "function", "name": "setPolicy", "inputs": [{ … }] }]
 * Pretty-printed JSON needs a tall box and raw `JSON.stringify` is unreadable,
 * so the separators are spaced out and the whole thing stays on one line.
 */
export function abiOneLine(abi) {
  if (!Array.isArray(abi) || abi.length === 0) return '';
  return JSON.stringify(abi)
    .replace(/\{"/g, '{ "')
    .replace(/","/g, '", "')
    .replace(/":/g, '": ')
    .replace(/,"/g, ', "')
    .replace(/\}/g, ' }')
    .replace(/\},\{/g, '}, {');
}

/**
 * Confirms a contract actually exists at `address` on the connected network.
 * Resolves to a warning string, or null when the check passes or cannot run —
 * a failed lookup must never block loading.
 */
export async function checkContractExists(address, providerUrl, networkName) {
  if (!providerUrl) return null;
  try {
    const code = await rpcCall(providerUrl, 'eth_getCode', [address, 'latest']);
    if (code && code !== '0x') return null;
    const where = networkName ? ` on ${networkName}` : '';
    return `No contract code at this address${where} — check the address and the selected network.`;
  } catch {
    return null; // Node unreachable: stay quiet rather than guess.
  }
}
