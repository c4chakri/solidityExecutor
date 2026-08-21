/**
 * Network registry.
 *
 * Built-in presets live in BUILTIN_NETWORKS. Anything the user adds is kept as
 * an *overlay* keyed by hex chain ID, so adding an RPC for a chain we already
 * ship appends to that chain's `rpcUrls` instead of creating a second entry.
 * Overlays persist in localStorage.
 *
 * The store is a bounded most-recently-used cache: both the number of overlaid
 * networks and the number of RPCs per chain are capped, and the least recently
 * used entry is evicted when a cap is hit. Adding endpoints therefore can never
 * grow storage without limit, and the UI never has to render an unbounded list.
 * The most recently added RPC for a chain is the one used for reads.
 */

export const DEFAULT_CURRENCY = { name: 'Ether', symbol: 'ETH', decimals: 18 };

/** Overlaid networks kept at once. Built-in presets are always kept. */
export const MAX_OVERLAY_NETWORKS = 25;
/** User-added RPC endpoints kept per chain. */
export const MAX_RPCS_PER_CHAIN = 5;

export const BUILTIN_NETWORKS = {
  '0x1': {
    chainId: '0x1',
    chainName: 'Ethereum',
    rpcUrls: ['https://eth.llamarpc.com'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://etherscan.io'],
  },
  '0xaa36a7': {
    chainId: '0xaa36a7',
    chainName: 'Sepolia',
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  '0x4268': {
    chainId: '0x4268',
    chainName: 'Holesky',
    rpcUrls: ['https://ethereum-holesky-rpc.publicnode.com'],
    nativeCurrency: { name: 'Holesky Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://holesky.etherscan.io'],
  },
  '0x89': {
    chainId: '0x89',
    chainName: 'Polygon',
    rpcUrls: ['https://polygon-rpc.com'],
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    blockExplorerUrls: ['https://polygonscan.com'],
  },
  '0xc73b': {
    chainId: '0xc73b',
    chainName: 'MOBIUS',
    rpcUrls: ['https://besu-rpc.gov-cloud.ai'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

export const OVERLAYS_STORAGE_KEY = 'networks.overlays.v1';
export const RPC_TIMEOUT_MS = 10000;

/* -------------------------------------------------------------------- helpers */

export function toHexChainId(value) {
  const id = BigInt(value);
  if (id <= 0n) throw new Error('Chain ID must be a positive number');
  return '0x' + id.toString(16);
}

export function chainIdToDecimal(hexChainId) {
  try {
    return BigInt(hexChainId).toString(10);
  } catch {
    return hexChainId;
  }
}

/** True for hosts a browser still allows over plain http from an https page. */
function isLocalHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

function normalizeHttpUrl(raw, { label }) {
  const text = raw.trim();

  let url;
  try {
    url = new URL(text);
  } catch {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      throw new Error(`${label} needs a scheme — start it with https://`);
    }
    throw new Error(`${label} is not a valid URL`);
  }

  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    throw new Error(`${label} must be an http(s) endpoint — websockets are not supported`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must start with http:// or https://`);
  }
  if (!url.hostname) throw new Error(`${label} has no host`);

  // An https page cannot fetch http:// — the browser blocks it as mixed
  // content, which surfaces as an unexplained network failure.
  if (
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    url.protocol === 'http:' &&
    !isLocalHost(url.hostname)
  ) {
    throw new Error(
      `This page is served over https, so the browser will block http://${url.hostname} — use https`
    );
  }

  if (url.username || url.password) {
    throw new Error(`${label} must not contain a username or password`);
  }

  // Trailing slash only; keep any path, query and port the node needs.
  return url.toString().replace(/\/$/, '');
}

/** Validates and canonicalises an RPC URL so equal URLs compare equal. */
export function normalizeRpcUrl(raw) {
  const text = (raw || '').trim();
  if (!text) throw new Error('Enter an RPC URL');
  return normalizeHttpUrl(text, { label: 'RPC URL' });
}

/** Same, for the optional block explorer. Returns null when left blank. */
export function normalizeExplorerUrl(raw) {
  const text = (raw || '').trim();
  if (!text) return null;
  return normalizeHttpUrl(text, { label: 'Explorer URL' });
}

/** The endpoint reads go through: the most recently added one. */
export function activeRpcUrl(net) {
  if (!net || !net.rpcUrls || net.rpcUrls.length === 0) return null;
  return net.rpcUrls[net.rpcUrls.length - 1];
}

/** Compact form for display, e.g. `besu-rpc.gov-cloud.ai/path`. */
export function shortenUrl(url, maxLength = 34) {
  if (!url) return '';
  let text = url.replace(/^https?:\/\//, '');
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/**
 * `<explorer>/tx/<hash>` or `<explorer>/address/<addr>`, or null.
 * A missing `kind` returns null rather than a `/undefined/` path — callers look
 * it up per field, and most fields are not linkable.
 */
export function buildExplorerUrl(base, kind, value) {
  if (!base || !kind || !value) return null;
  return `${base.replace(/\/$/, '')}/${kind}/${value}`;
}

/** The explorer this chain was configured with, if any. */
export function explorerBase(net) {
  return net?.blockExplorerUrls?.[0] || null;
}

/** A tx/address link for a chain, when an explorer is known. */
export function explorerLink(net, kind, value) {
  return buildExplorerUrl(explorerBase(net), kind, value);
}

function dedupe(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** Only the fields `wallet_addEthereumChain` accepts. */
export function toWalletChainParams(net) {
  const params = {
    chainId: net.chainId,
    chainName: net.chainName,
    rpcUrls: net.rpcUrls,
    nativeCurrency: net.nativeCurrency || DEFAULT_CURRENCY,
  };
  // MetaMask rejects an empty blockExplorerUrls array, so only send a real one.
  if (net.blockExplorerUrls && net.blockExplorerUrls.length > 0) {
    params.blockExplorerUrls = net.blockExplorerUrls;
  }
  return params;
}

/* ------------------------------------------------------------ chain detection */

/**
 * One JSON-RPC round trip with a hard timeout and specific error messages.
 * Used instead of a provider so a bad URL fails once, loudly, rather than
 * being retried in the background.
 */
export async function rpcCall(rpcUrl, method, params = [], { timeoutMs = RPC_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`RPC did not respond within ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new Error('Could not reach that RPC (network error or CORS blocked)');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`RPC rejected the request (HTTP ${response.status}) — check the API key`);
    }
    if (response.status === 429) throw new Error('RPC is rate limiting this key (HTTP 429)');
    if (response.status === 404) {
      throw new Error('RPC returned HTTP 404 — check the path of the URL');
    }
    throw new Error(`RPC returned HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('RPC returned a non-JSON response');
  }
  if (payload.error) {
    throw new Error(`RPC error: ${payload.error.message || `${method} failed`}`);
  }
  return payload.result;
}

/** Asks the node for its chain ID (`eth_chainId`) so the user never types one. */
export async function detectChainId(rpcUrl, options = {}) {
  const result = await rpcCall(rpcUrl, 'eth_chainId', [], options);
  if (!result) {
    throw new Error('That endpoint answered but returned no chain ID — is it an EVM JSON-RPC node?');
  }
  try {
    return toHexChainId(result);
  } catch {
    throw new Error(`RPC returned an unusable chain ID: ${result}`);
  }
}

/* --------------------------------------------------------------------- merging */

/** Built-in presets plus user overlays, with rpcUrls unioned per chain. */
export function mergeNetworks(overlays = {}) {
  const merged = {};

  for (const [id, net] of Object.entries(BUILTIN_NETWORKS)) {
    merged[id] = { ...net, rpcUrls: [...net.rpcUrls] };
  }

  for (const [id, overlay] of Object.entries(overlays)) {
    const base = merged[id];
    const explorers = overlay.blockExplorerUrls || base?.blockExplorerUrls;
    merged[id] = {
      chainId: id,
      chainName: overlay.chainName || base?.chainName || `Chain ${chainIdToDecimal(id)}`,
      rpcUrls: dedupe([...(base?.rpcUrls || []), ...(overlay.rpcUrls || [])]),
      nativeCurrency: base?.nativeCurrency || overlay.nativeCurrency || DEFAULT_CURRENCY,
      ...(explorers && explorers.length > 0 ? { blockExplorerUrls: explorers } : {}),
    };
  }

  return merged;
}

/* ------------------------------------------------------- bounded overlay store */

/** Rebuilds the map with `chainId` last, i.e. most recently used. */
function moveToEnd(overlays, chainId) {
  const entry = overlays[chainId];
  if (!entry) return overlays;
  const next = {};
  for (const [id, value] of Object.entries(overlays)) {
    if (id !== chainId) next[id] = value;
  }
  next[chainId] = entry;
  return next;
}

/** Marks a chain as most recently used so it survives eviction. */
export function touchNetwork(overlays, chainId) {
  return moveToEnd(overlays, chainId);
}

/**
 * Appends `rpcUrl` to the overlay for `chainId`, creating it when the chain is
 * new, and enforces both caps by evicting the least recently used entry.
 *
 * Pure. Returns { overlays, evictedRpc, evictedNetwork } so the caller can tell
 * the user what was dropped rather than losing it silently.
 */
export function appendRpc(overlays, { chainId, rpcUrl, chainName, explorerUrl }) {
  const existing = overlays[chainId];

  // Re-adding a known URL promotes it to most-recent rather than duplicating.
  const kept = ((existing && existing.rpcUrls) || []).filter((url) => url !== rpcUrl);
  let urls = dedupe([...kept, rpcUrl]);

  let evictedRpc = null;
  while (urls.length > MAX_RPCS_PER_CHAIN) {
    evictedRpc = urls.shift();
  }

  const explorers = explorerUrl
    ? [explorerUrl]
    : (existing && existing.blockExplorerUrls) || null;

  let next = {
    ...overlays,
    [chainId]: {
      chainId,
      ...(chainName || existing?.chainName
        ? { chainName: chainName || existing.chainName }
        : {}),
      rpcUrls: urls,
      ...(explorers ? { blockExplorerUrls: explorers } : {}),
    },
  };
  next = moveToEnd(next, chainId);

  let evictedNetwork = null;
  while (Object.keys(next).length > MAX_OVERLAY_NETWORKS) {
    const oldest = Object.keys(next)[0];
    evictedNetwork = next[oldest]?.chainName || `Chain ${chainIdToDecimal(oldest)}`;
    const trimmed = { ...next };
    delete trimmed[oldest];
    next = trimmed;
  }

  return { overlays: next, evictedRpc, evictedNetwork };
}

/* ----------------------------------------------------------------- persistence */

function readJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode) — state still works in-memory.
  }
}

/** Loads overlays, re-applying every cap in case storage was hand-edited. */
export function loadOverlays() {
  const stored = readJson(OVERLAYS_STORAGE_KEY, {});
  const clean = {};

  for (const [rawId, overlay] of Object.entries(stored)) {
    if (!/^0x[0-9a-f]+$/i.test(rawId) || !overlay || !Array.isArray(overlay.rpcUrls)) continue;

    const urls = dedupe(
      overlay.rpcUrls.filter((url) => typeof url === 'string' && url.trim() !== '')
    ).slice(-MAX_RPCS_PER_CHAIN);
    if (urls.length === 0) continue;

    const id = rawId.toLowerCase();
    const explorers = Array.isArray(overlay.blockExplorerUrls)
      ? overlay.blockExplorerUrls.filter((url) => typeof url === 'string' && url).slice(0, 1)
      : null;

    clean[id] = {
      chainId: id,
      ...(typeof overlay.chainName === 'string' && overlay.chainName
        ? { chainName: overlay.chainName }
        : {}),
      rpcUrls: urls,
      ...(explorers && explorers.length > 0 ? { blockExplorerUrls: explorers } : {}),
    };
  }

  const ids = Object.keys(clean);
  if (ids.length <= MAX_OVERLAY_NETWORKS) return clean;

  const trimmed = {};
  for (const id of ids.slice(-MAX_OVERLAY_NETWORKS)) trimmed[id] = clean[id];
  return trimmed;
}

export function saveOverlays(overlays) {
  writeJson(OVERLAYS_STORAGE_KEY, overlays);
}
