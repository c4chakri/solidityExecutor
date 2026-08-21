import { ethers } from 'ethers';

/**
 * Turns the plain text typed into a form field into the JS value ethers expects
 * for a given ABI parameter.
 *
 * Scalar params (address, uint256, string, ...) are taken verbatim: the whole
 * field is one value, so a `string` may safely contain commas, spaces, quotes.
 *
 * Complex params (tuple, and any array) are parsed as a value literal:
 *   [true, 2, 100, "0xe2b3..."]        positional tuple / array
 *   (true, 2, 100, 0xe2b3...)          parens and bare hex also accepted
 *   { active: true, tier: 2 }          named tuple
 * Numbers are kept as text until the very last step so uint256 values larger
 * than Number.MAX_SAFE_INTEGER survive intact (JSON.parse would round them).
 */

const PUNCTUATION = new Set(['[', ']', '(', ')', '{', '}', ',', ':']);

/**
 * True for functions that only read. Pre-0.5 ABIs carry `constant: true` with no
 * `stateMutability`, so both spellings are honoured.
 */
export function isReadFunction(fn) {
  if (fn.stateMutability) return fn.stateMutability === 'view' || fn.stateMutability === 'pure';
  return fn.constant === true;
}

/** Stable identity for a function, unique across overloads. */
export function functionKey(fn) {
  return `${fn.name}(${(fn.inputs || []).map((input) => input.type).join(',')})`;
}

/** True for params whose field holds a literal that needs parsing. */
export function isComplexType(type) {
  return type.includes('[') || type === 'tuple' || type.startsWith('tuple');
}

/* ------------------------------------------------------------------ tokenizer */

function tokenize(text) {
  const tokens = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (PUNCTUATION.has(ch)) {
      tokens.push({ kind: ch });
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let value = '';
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\' && i + 1 < text.length) {
          value += text[i + 1];
          i += 2;
        } else {
          value += text[i];
          i++;
        }
      }
      if (i >= text.length) throw new Error('unterminated string literal');
      i++; // closing quote
      tokens.push({ kind: 'text', value, quoted: true });
      continue;
    }

    let word = '';
    while (i < text.length && !PUNCTUATION.has(text[i]) && !/\s/.test(text[i])) {
      word += text[i];
      i++;
    }
    tokens.push({ kind: 'text', value: word, quoted: false });
  }

  return tokens;
}

/* --------------------------------------------------------------------- parser */

const CLOSERS = { '[': ']', '(': ')' };

function parseNodes(text) {
  const tokens = tokenize(text);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseValue() {
    const token = peek();
    if (!token) throw new Error('unexpected end of value');

    if (token.kind === '[' || token.kind === '(') {
      next();
      const closer = CLOSERS[token.kind];
      const items = [];
      if (peek() && peek().kind === closer) {
        next();
        return { kind: 'list', items };
      }
      for (;;) {
        items.push(parseValue());
        const sep = next();
        if (!sep) throw new Error(`missing closing "${closer}"`);
        if (sep.kind === closer) break;
        if (sep.kind !== ',') throw new Error(`expected "," or "${closer}"`);
      }
      return { kind: 'list', items };
    }

    if (token.kind === '{') {
      next();
      const entries = new Map();
      if (peek() && peek().kind === '}') {
        next();
        return { kind: 'object', entries };
      }
      for (;;) {
        const key = next();
        if (!key || key.kind !== 'text') throw new Error('expected a field name');
        const colon = next();
        if (!colon || colon.kind !== ':') throw new Error(`expected ":" after "${key.value}"`);
        entries.set(key.value, parseValue());
        const sep = next();
        if (!sep) throw new Error('missing closing "}"');
        if (sep.kind === '}') break;
        if (sep.kind !== ',') throw new Error('expected "," or "}"');
      }
      return { kind: 'object', entries };
    }

    if (token.kind === 'text') {
      next();
      return { kind: 'scalar', value: token.value, quoted: token.quoted };
    }

    throw new Error(`unexpected "${token.kind}"`);
  }

  const node = parseValue();
  if (pos < tokens.length) throw new Error('unexpected trailing characters');
  return node;
}

/* ------------------------------------------------------------------- coercion */

const ARRAY_SUFFIX = /^(.*)\[(\d*)\]$/;
const INT_TYPE = /^(u?)int(\d*)$/;
const BYTES_TYPE = /^bytes(\d*)$/;

function label(path) {
  return path ? `"${path}"` : 'value';
}

function coerceInteger(type, text, path) {
  const [, unsigned, bitsRaw] = INT_TYPE.exec(type);
  const bits = bitsRaw ? Number(bitsRaw) : 256;

  let value;
  try {
    value = BigInt(text);
  } catch {
    throw new Error(`${label(path)}: "${text}" is not a valid ${type}`);
  }

  if (unsigned) {
    if (value < 0n) throw new Error(`${label(path)}: ${type} cannot be negative`);
    if (value >= 1n << BigInt(bits)) {
      throw new Error(`${label(path)}: ${value} does not fit in ${type}`);
    }
  } else {
    const limit = 1n << BigInt(bits - 1);
    if (value < -limit || value >= limit) {
      throw new Error(`${label(path)}: ${value} does not fit in ${type}`);
    }
  }
  return value;
}

function coerceScalar(type, node, path) {
  if (node.kind !== 'scalar') {
    throw new Error(`${label(path)}: expected a single ${type} value, got a list`);
  }
  const raw = node.value;
  const text = node.quoted ? raw : raw.trim();

  if (type === 'string') return raw;

  if (text === '') throw new Error(`${label(path)}: a ${type} value is required`);

  if (type === 'bool') {
    const flag = text.toLowerCase();
    if (flag === 'true' || flag === '1') return true;
    if (flag === 'false' || flag === '0') return false;
    throw new Error(`${label(path)}: "${text}" is not a bool (use true or false)`);
  }

  if (INT_TYPE.test(type)) return coerceInteger(type, text, path);

  if (type === 'address') {
    if (text.includes('.')) return text; // ENS name, resolved by the provider
    try {
      return ethers.getAddress(text);
    } catch {
      throw new Error(`${label(path)}: "${text}" is not a valid address`);
    }
  }

  const bytesMatch = BYTES_TYPE.exec(type);
  if (bytesMatch) {
    const size = bytesMatch[1] ? Number(bytesMatch[1]) : null;
    if (size === null) {
      if (!ethers.isHexString(text)) {
        throw new Error(`${label(path)}: bytes must be 0x-prefixed hex with an even length`);
      }
    } else if (!ethers.isHexString(text, size)) {
      throw new Error(`${label(path)}: expected ${size} hex bytes (0x + ${size * 2} chars) for ${type}`);
    }
    return text;
  }

  // Unknown / future type: hand the text to ethers and let it decide.
  return text;
}

function coerceTuple(components, node, path) {
  const parts = components || [];

  if (node.kind === 'object') {
    const known = new Set(parts.map((c, i) => c.name || `_${i}`));
    for (const key of node.entries.keys()) {
      if (!known.has(key)) {
        throw new Error(`${label(path)}: unknown field "${key}"`);
      }
    }
    return parts.map((component, i) => {
      const name = component.name || `_${i}`;
      const child = node.entries.get(name);
      if (child === undefined) {
        throw new Error(`${label(path)}: missing field "${name}"`);
      }
      return coerceNode(component, child, path ? `${path}.${name}` : name);
    });
  }

  if (node.kind !== 'list') {
    throw new Error(
      `${label(path)}: expected ${parts.length} values in [ ] for ${formatType({ type: 'tuple', components: parts })}`
    );
  }
  if (node.items.length !== parts.length) {
    throw new Error(
      `${label(path)}: expected ${parts.length} values, got ${node.items.length} — ` +
        formatType({ type: 'tuple', components: parts })
    );
  }
  return parts.map((component, i) =>
    coerceNode(component, node.items[i], path ? `${path}.${component.name || i}` : component.name || `${i}`)
  );
}

function coerceNode(param, node, path) {
  const arrayMatch = ARRAY_SUFFIX.exec(param.type);
  if (arrayMatch) {
    const [, innerType, fixedLength] = arrayMatch;
    if (node.kind !== 'list') {
      throw new Error(`${label(path)}: expected a list in [ ] for ${param.type}`);
    }
    if (fixedLength && node.items.length !== Number(fixedLength)) {
      throw new Error(
        `${label(path)}: ${param.type} needs exactly ${fixedLength} items, got ${node.items.length}`
      );
    }
    return node.items.map((item, i) =>
      coerceNode({ ...param, type: innerType }, item, `${path}[${i}]`)
    );
  }

  if (param.type === 'tuple') return coerceTuple(param.components, node, path);

  return coerceScalar(param.type, node, path);
}

/** Coerces one field's text into the value ethers expects for `param`. */
export function coerceParam(param, text, path = param.name || '') {
  const raw = text == null ? '' : String(text);

  if (!isComplexType(param.type)) {
    return coerceScalar(param.type, { kind: 'scalar', value: raw, quoted: false }, path);
  }

  if (raw.trim() === '') {
    throw new Error(`${label(path)}: a ${formatType(param)} value is required`);
  }

  let node;
  try {
    node = parseNodes(raw);
  } catch (err) {
    throw new Error(`${label(path)}: ${err.message}`);
  }
  return coerceNode(param, node, path);
}

/** Builds the positional argument list for a function from `{ [index]: text }`. */
export function buildArgs(fn, values) {
  return (fn.inputs || []).map((param, i) => {
    const path = param.name || `arg${i}`;
    try {
      return coerceParam(param, values[i], path);
    } catch (err) {
      throw new Error(`Argument ${i + 1} — ${err.message}`);
    }
  });
}

/* ------------------------------------------------------------------ formatting */

/** Human-readable type, expanding tuples: `tuple(bool active, uint8 tier)`. */
export function formatType(param) {
  const arrayMatch = ARRAY_SUFFIX.exec(param.type);
  if (arrayMatch) {
    const [, innerType, fixedLength] = arrayMatch;
    return `${formatType({ ...param, type: innerType })}[${fixedLength}]`;
  }
  if (param.type === 'tuple') {
    const parts = (param.components || []).map((c) =>
      c.name ? `${formatType(c)} ${c.name}` : formatType(c)
    );
    return `tuple(${parts.join(', ')})`;
  }
  return param.type;
}

/** A copy-pasteable skeleton showing the shape a complex field expects. */
export function sampleLiteral(param) {
  const arrayMatch = ARRAY_SUFFIX.exec(param.type);
  if (arrayMatch) {
    const [, innerType, fixedLength] = arrayMatch;
    const count = fixedLength ? Number(fixedLength) : 2;
    const inner = sampleLiteral({ ...param, type: innerType });
    return `[${Array.from({ length: count }, () => inner).join(', ')}]`;
  }
  if (param.type === 'tuple') {
    return `[${(param.components || []).map(sampleLiteral).join(', ')}]`;
  }
  if (param.type === 'bool') return 'true';
  if (INT_TYPE.test(param.type)) return '0';
  if (param.type === 'address') return '"0x0000000000000000000000000000000000000000"';
  if (param.type === 'string') return '"text"';
  const bytesMatch = BYTES_TYPE.exec(param.type);
  if (bytesMatch) return `"0x${'00'.repeat(bytesMatch[1] ? Number(bytesMatch[1]) : 1)}"`;
  return '""';
}

/** Full signature, e.g. `setPolicy(address token, tuple(bool active) policy)`. */
export function formatSignature(fn) {
  const params = (fn.inputs || []).map((p) =>
    p.name ? `${formatType(p)} ${p.name}` : formatType(p)
  );
  return `${fn.name}(${params.join(', ')})`;
}
