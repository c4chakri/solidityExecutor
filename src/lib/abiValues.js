/**
 * Shared conversion of decoded ABI values into JSON-safe plain data.
 *
 * ethers returns BigInt for every integer type and a `Result` (an Array
 * subclass) for tuples, neither of which JSON.stringify can render — BigInt
 * throws, and a Result loses its field names.
 */

/**
 * Recursively replaces BigInt with its decimal string, and keys nested tuples
 * by their component names when the ABI declared them — `policy.tier` reads far
 * better than `policy[1]` in a decoded event or revert.
 */
export function toPlain(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    const named = namedTuple(value);
    return named || value.map(toPlain);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key in value) out[key] = toPlain(value[key]);
    return out;
  }
  return value;
}

/**
 * An ethers `Result` for a tuple whose components are all named, as an object.
 * Returns null for a plain array, or a tuple with any unnamed component —
 * `toObject()` throws in that case, and positional output is then correct.
 */
function namedTuple(value) {
  if (typeof value.toObject !== 'function') return null;
  try {
    const fields = value.toObject();
    const out = {};
    for (const key in fields) out[key] = toPlain(fields[key]);
    return out;
  } catch {
    return null;
  }
}

/** Keys a decoded Result by its fragment's parameter names. */
export function namedArgs(fragment, args) {
  const out = {};
  (fragment?.inputs || []).forEach((input, i) => {
    out[input.name || `arg${i}`] = toPlain(args[i]);
  });
  return out;
}
