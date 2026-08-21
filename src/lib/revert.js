import { ethers } from 'ethers';
import { namedArgs, toPlain } from './abiValues';

/**
 * Turns a failed call/transaction into something readable.
 *
 * ethers only decodes a custom error when the matching `error` fragment is in
 * the ABI it was given — otherwise it reports "unknown custom error" and drops
 * the payload. So we dig the raw revert data out of the error (every provider
 * buries it somewhere different), then decode it against, in order:
 *   1. the contract's own ABI,
 *   2. a registry of errors from common libraries (OpenZeppelin, Solady, ...),
 *   3. Solidity's built-in Error(string) / Panic(uint256).
 * When nothing matches we still report the 4-byte selector and raw data so the
 * error can be looked up instead of vanishing.
 */

/** Errors from libraries a contract may inherit but not list in its own ABI. */
export const KNOWN_ERROR_SIGNATURES = [
  // OpenZeppelin v5 — access & lifecycle
  'error OwnableUnauthorizedAccount(address account)',
  'error OwnableInvalidOwner(address owner)',
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
  'error AccessControlBadConfirmation()',
  'error ReentrancyGuardReentrantCall()',
  'error EnforcedPause()',
  'error ExpectedPause()',
  'error InvalidInitialization()',
  'error NotInitializing()',
  // OpenZeppelin v5 — ERC20
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidReceiver(address receiver)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error ERC20InvalidApprover(address approver)',
  'error ERC20InvalidSpender(address spender)',
  'error ERC20ExceededCap(uint256 increasedSupply, uint256 cap)',
  'error ERC20InvalidCap(uint256 cap)',
  'error ERC2612ExpiredSignature(uint256 deadline)',
  'error ERC2612InvalidSigner(address signer, address owner)',
  'error InvalidAccountNonce(address account, uint256 currentNonce)',
  // OpenZeppelin v5 — ERC721 / ERC1155
  'error ERC721InvalidOwner(address owner)',
  'error ERC721NonexistentToken(uint256 tokenId)',
  'error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner)',
  'error ERC721InvalidSender(address sender)',
  'error ERC721InvalidReceiver(address receiver)',
  'error ERC721InsufficientApproval(address operator, uint256 tokenId)',
  'error ERC721InvalidApprover(address approver)',
  'error ERC721InvalidOperator(address operator)',
  'error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId)',
  'error ERC1155InvalidSender(address sender)',
  'error ERC1155InvalidReceiver(address receiver)',
  'error ERC1155MissingApprovalForAll(address operator, address owner)',
  'error ERC1155InvalidApprover(address approver)',
  'error ERC1155InvalidOperator(address operator)',
  'error ERC1155InvalidArrayLength(uint256 idsLength, uint256 valuesLength)',
  // OpenZeppelin v5 — utils, proxies, signatures
  'error SafeERC20FailedOperation(address token)',
  'error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease)',
  'error AddressInsufficientBalance(address account)',
  'error AddressEmptyCode(address target)',
  'error FailedInnerCall()',
  'error FailedCall()',
  'error InsufficientBalance(uint256 balance, uint256 needed)',
  'error ECDSAInvalidSignature()',
  'error ECDSAInvalidSignatureLength(uint256 length)',
  'error ECDSAInvalidSignatureS(bytes32 s)',
  'error ERC1967InvalidImplementation(address implementation)',
  'error ERC1967NonPayable()',
  'error UUPSUnauthorizedCallContext()',
  'error UUPSUnsupportedProxiableUUID(bytes32 slot)',
  'error MathOverflowedMulDiv()',
  'error StringsInsufficientHexLength(uint256 value, uint256 length)',
  'error SafeCastOverflowedUintDowncast(uint8 bits, uint256 value)',
  'error SafeCastOverflowedIntDowncast(uint8 bits, int256 value)',
  // Frequently seen elsewhere (Solady, permit2, common patterns)
  'error Unauthorized()',
  'error InvalidSignature()',
  'error SignatureExpired(uint256 deadline)',
  'error DeadlineExpired()',
  'error InsufficientAllowance()',
  'error AlreadyInitialized()',
  'error ArrayLengthsMismatch()',
  'error ZeroAddress()',
  'error ZeroAmount()',
];

/** Solidity's Panic(uint256) codes. */
const PANIC_REASONS = {
  '0': 'generic compiler panic',
  '1': 'assert(false)',
  '17': 'arithmetic overflow or underflow',
  '18': 'division or modulo by zero',
  '33': 'invalid value cast to an enum',
  '34': 'invalid storage byte array encoding',
  '49': '.pop() on an empty array',
  '50': 'array index out of bounds, or slice out of range',
  '65': 'out-of-memory (allocation too large)',
  '81': 'call to an uninitialised internal function',
};

let knownInterface = null;
function getKnownInterface() {
  if (!knownInterface) knownInterface = new ethers.Interface(KNOWN_ERROR_SIGNATURES);
  return knownInterface;
}

/* ------------------------------------------------------- revert data recovery */

const HEX_DATA = /^0x([0-9a-f]{2})*$/i;
const ANY_HEX = /0x[0-9a-f]{8,}/i;
// Geth/Besu/Erigon put the payload in the message: "execution reverted: 0x1234"
const HEX_IN_TEXT = /(?:revert(?:ed)?|return(?:ed)?data|data)[^0-9a-fx]*?(0x[0-9a-f]{8,})/i;
const DATA_KEY = /^(data|returndata|revertdata|originaldata)$/i;
const MESSAGE_KEY = /^(message|shortmessage|reason)$/i;

function looksLikeRevertData(value) {
  if (typeof value !== 'string' || !HEX_DATA.test(value)) return false;
  // Anything between 0x and a 4-byte selector cannot be revert data.
  return value.length === 2 || value.length >= 10;
}

/** Pulls revert data out of a `data` field that may be text-wrapped. */
function dataFromField(value) {
  if (looksLikeRevertData(value)) return value;
  // Besu answers "Reverted 0x08c379a0…" under `data`.
  const embedded = HEX_IN_TEXT.exec(value) || ANY_HEX.exec(value);
  const hex = embedded ? embedded[1] || embedded[0] : null;
  return hex && looksLikeRevertData(hex) ? hex : null;
}

/**
 * Walks a provider error for the raw revert payload. Prefers values found under
 * a `data`-ish key, then falls back to hex embedded in an error message.
 */
export function extractRevertData(err) {
  if (!err || typeof err !== 'object') return null;

  const seen = new Set();
  const messages = [];
  const queue = [{ node: err, key: '' }];
  let fallback = null;

  while (queue.length > 0 && seen.size <= 200) {
    const { node, key } = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    for (const [childKey, value] of Object.entries(node)) {
      if (value && typeof value === 'object') {
        queue.push({ node: value, key: childKey.toLowerCase() });
        continue;
      }
      if (typeof value !== 'string') continue;

      if (DATA_KEY.test(childKey)) {
        const hex = dataFromField(value);
        if (hex) return hex;
      } else if (MESSAGE_KEY.test(childKey)) {
        messages.push(value);
      } else if (!fallback && key === 'data' && looksLikeRevertData(value)) {
        fallback = value;
      }
    }
  }

  for (const message of messages) {
    const embedded = HEX_IN_TEXT.exec(message);
    if (embedded && looksLikeRevertData(embedded[1])) return embedded[1];
  }

  return fallback;
}

/* ------------------------------------------------------------------- decoding */

function summarise(name, fragment, args) {
  const parts = (fragment.inputs || []).map((input, i) => {
    const shown = toPlain(args[i]);
    const text = typeof shown === 'object' ? JSON.stringify(shown) : String(shown);
    return input.name ? `${input.name}: ${text}` : text;
  });
  return `${name}(${parts.join(', ')})`;
}

/** The interfaces to try, in priority order: the contract's own ABI first. */
function decodingInterfaces(abi) {
  const attempts = [];
  if (abi) {
    try {
      attempts.push({ iface: new ethers.Interface(abi), source: 'contract ABI' });
    } catch {
      // Malformed ABI — fall through to the shared registry.
    }
  }
  attempts.push({ iface: getKnownInterface(), source: 'known library errors' });
  return attempts;
}

function describeWith(iface, data) {
  try {
    return iface.parseError(data);
  } catch {
    return null;
  }
}

function asResult(described, { selector, data, source }) {
  if (described.name === 'Error') {
    return {
      kind: 'require',
      name: 'Error',
      signature: described.signature,
      selector,
      args: { reason: described.args[0] },
      summary: `require/revert: ${described.args[0]}`,
      source: 'Solidity',
      data,
    };
  }

  if (described.name === 'Panic') {
    const code = described.args[0].toString();
    const reason = PANIC_REASONS[code] || `panic code ${code}`;
    return {
      kind: 'panic',
      name: 'Panic',
      signature: described.signature,
      selector,
      args: { code, reason },
      summary: `Panic: ${reason} (code 0x${BigInt(code).toString(16)})`,
      source: 'Solidity',
      data,
    };
  }

  return {
    kind: 'custom',
    name: described.name,
    signature: described.signature,
    selector,
    args: namedArgs(described.fragment, described.args),
    summary: summarise(described.name, described.fragment, described.args),
    source,
    data,
  };
}

/**
 * Decodes revert data. Returns null when `data` is not usable.
 * Shape: { kind, name, signature, selector, args, summary, source, data }
 */
export function decodeRevertData(data, abi) {
  if (typeof data !== 'string' || !HEX_DATA.test(data)) return null;

  if (data === '0x' || data.length < 10) {
    return {
      kind: 'empty',
      selector: null,
      data,
      summary: 'reverted without any data',
      source: null,
    };
  }

  const selector = data.slice(0, 10).toLowerCase();

  for (const { iface, source } of decodingInterfaces(abi)) {
    const described = describeWith(iface, data);
    if (described) return asResult(described, { selector, data, source });
  }

  return {
    kind: 'unknown',
    name: null,
    signature: null,
    selector,
    args: null,
    summary: `unrecognised custom error ${selector}`,
    source: null,
    data,
  };
}

/** The `error` fragments present in an ABI, for the "what can be decoded" hint. */
export function listAbiErrors(abi) {
  try {
    const iface = new ethers.Interface(abi);
    const names = [];
    iface.forEachError((fragment) => names.push(fragment.format('sighash')));
    return names;
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------- presentation */

function baseMessage(err) {
  if (err?.shortMessage) return err.shortMessage;
  if (err?.info?.error?.message) return err.info.error.message;
  return err?.message || 'Transaction failed';
}

/**
 * Builds the object shown in the result box for a failed call/transaction.
 * Always returns `{ error, ... }`; adds `revert` details whenever decodable.
 */
export function describeFailure(err, abi) {
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) {
    return { error: 'Rejected in wallet' };
  }

  const data = extractRevertData(err);
  const decoded = decodeRevertData(data, abi);

  if (!decoded) {
    const out = { error: baseMessage(err) };
    if (err?.code) out.code = err.code;
    return out;
  }

  if (decoded.kind === 'empty') {
    return {
      error: 'Reverted with no reason data',
      hint:
        'A bare revert()/require() without a message, a failed low-level call, ' +
        'or the address may not hold contract code on this network.',
      revert: { data: decoded.data },
    };
  }

  if (decoded.kind === 'unknown') {
    const abiErrors = listAbiErrors(abi);
    return {
      error: `Reverted with an unrecognised custom error (${decoded.selector})`,
      hint:
        abiErrors.length === 0
          ? 'The loaded ABI declares no error types. Paste the full ABI (including its "error" entries) to decode this.'
          : `Not one of the ${abiErrors.length} error(s) in this ABI, so it likely came from a library or another contract this call touched. Look up the selector at openchain.xyz/signatures or 4byte.directory.`,
      revert: {
        selector: decoded.selector,
        data: decoded.data,
        ...(abiErrors.length > 0 ? { knownAbiErrors: abiErrors } : {}),
      },
    };
  }

  return {
    error: `Reverted: ${decoded.summary}`,
    revert: {
      kind: decoded.kind,
      name: decoded.name,
      signature: decoded.signature,
      selector: decoded.selector,
      ...(decoded.args ? { args: decoded.args } : {}),
      ...(decoded.source ? { decodedFrom: decoded.source } : {}),
      data: decoded.data,
    },
  };
}
