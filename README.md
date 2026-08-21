# Smart Contract Interactor

A browser tool for working against any EVM contract: call its functions, send
transactions, and read back decoded events and reverts. Point it at an address,
paste the ABI, and every function becomes a form.

Built with React 19 and [ethers v6](https://docs.ethers.org/v6/). No backend —
it talks to a JSON-RPC endpoint and to the wallet in the browser.

---

## Contents

- [Quick start](#quick-start)
- [What it does](#what-it-does)
- [Entering arguments](#entering-arguments)
- [Reading errors](#reading-errors)
- [Networks and RPC endpoints](#networks-and-rpc-endpoints)
- [Themes](#themes)
- [Project layout](#project-layout)
- [Scripts](#scripts)
- [Stored state](#stored-state)
- [Limits and known gaps](#limits-and-known-gaps)

---

## Quick start

Requires Node 18+ and a browser wallet (MetaMask or any EIP-1193 provider).

```bash
npm install
npm start          # http://localhost:3000
```

Then:

1. **Connect Wallet** in the top right, and pick a network.
2. Paste a **contract address** and its **ABI**.
3. **Load Contract** — every function becomes a row you can expand.

---

## What it does

### Loading a contract

The ABI field accepts what you actually have on hand:

| You paste | Result |
| --- | --- |
| A JSON ABI array | Used as-is |
| A Hardhat / Foundry / Truffle artifact | The `abi` key is unwrapped for you |
| Raw solc output | `output.abi` is unwrapped |
| A single fragment | Wrapped into an array |
| Human-readable signatures, one per line | Parsed (`function transfer(address to, uint256 amt) returns (bool)`) |

Everything is normalised to canonical JSON fragments, so a pre-0.5 ABI carrying
`constant: true` becomes `stateMutability: "view"` and behaves like any other.

**Validation is strict where it matters.** `new ethers.Interface(abi)` is
deliberately forgiving — an unparseable fragment is logged to the console and
silently *dropped*, so a contract would load with functions quietly missing.
Every fragment is checked individually instead, and anything rejected is
reported by position and name:

```text
3 ABI fragment(s) are invalid — #2 "broken": invalid type; …
```

Addresses are checksummed, and the failure tells you which check failed:

| Input | Message |
| --- | --- |
| `0xF3001f12` | `An address is 40 hex digits after 0x — this has 8` |
| Wrong mixed-case checksum | `Address checksum is invalid — re-copy it, or paste it in lowercase` |
| `vitalik.eth` | `ENS names are not supported here — paste the address` |

Non-blocking warnings appear in amber: an ABI with no `error` types (revert
decoding will be limited), no functions, duplicate signatures, and — checked
against the connected node — **`No contract code at this address on Sepolia`**,
which catches the most common mistake of all: right address, wrong network.

### Calling and sending

Functions are grouped by what they cost you:

```text
[   Read   ][    All    ][   Write   ]
```

`Read` is `view` / `pure`; `Write` is `nonpayable` / `payable`. Read and write
never share a colour anywhere in the UI — sending a transaction spends money and
a `view` call does not. Filtering hides rows rather than unmounting them, so
switching filters never discards input you have typed.

A successful transaction returns the receipt with its **events decoded**:

```json
{
  "message": "Transaction successful!",
  "txHash": "0x7f3a…",
  "blockNumber": 8421337,
  "gasUsed": "84213",
  "events": [
    {
      "logIndex": 0,
      "address": "0xF300…f8C7",
      "event": "PolicySet",
      "signature": "PolicySet(address,uint8,uint256)",
      "args": { "token": "0xF300…f8C7", "tier": "2", "fee": "100" }
    }
  ]
}
```

Logs from other contracts your call touched cannot be decoded with your ABI, so
they come back with their address, topics and data rather than being dropped — a
missing log is more confusing than an undecoded one.

### Raw calldata

The last row sends pre-encoded bytes straight to the contract: a function missing
from the ABI, a `fallback`/`receive` handler, or calldata produced elsewhere that
must go out byte for byte. It decodes what you pasted **before** sending, since
bad calldata is unrecoverable once mined:

```text
Decodes to: setPolicy(token: 0xF300…f8C7, policy: {active: true, tier: 2})
```

The `0x` prefix is optional, case is ignored, and whitespace or newlines
anywhere are stripped — pasted hex usually arrives wrapped. An unknown selector
is flagged but still sendable; that is the point of the field.

### Verify Tx

A second tab looks up any transaction hash on the selected network and shows its
status and receipt fields.

---

## Entering arguments

Scalar parameters are taken verbatim — a `string` may contain commas, brackets
and quotes without being reinterpreted. Tuples and arrays are parsed as value
literals:

```solidity
setPolicy(address token, bytes4 selector, tuple(bool active, uint8 tier, uint256 fee, bytes32 root) policy)
```

```text
token     0xF3001f12221A3390CAE2daed751a4A3fC967f8C7
selector  0x374cf5e6
policy    [true, 2, 100, "0xe2b387e83abf5c0d12261fddc1ac19eef120b2a8b89efa6931834efe14aa5874"]
```

The parser accepts more than strict JSON:

| Form | Example |
| --- | --- |
| Positional tuple or array | `[true, 2, 100]` |
| Parentheses | `(true, 2, 100)` |
| Named tuple | `{ active: true, tier: 2, fee: 100 }` |
| Unquoted hex and addresses | `[0xF300…f8C7, 5]` |
| Single or double quotes | `['a, b', "c"]` |
| Nested tuples and arrays | `[7, [true, 0x…01]]` |
| Empty array | `[]` |

Numbers stay text until the final step, so a `uint256` above
`Number.MAX_SAFE_INTEGER` survives intact — `JSON.parse` would silently round it.

Validation is per-type, with the reason stated: `256 does not fit in uint8`,
`expected 32 hex bytes (0x + 64 chars) for bytes32`,
`expected 8 values, got 2 — tuple(bool active, uint8 tier, …)`.

Strings **inside** a tuple must be quoted, since the literal is tokenised.

---

## Reading errors

`execution reverted (unknown custom error)` is ethers saying it could not match
the 4-byte selector — and it then discards the payload. Revert data is dug out
of the provider error and decoded against, in order:

1. **Your contract ABI** — its `error` fragments.
2. **A registry of ~60 common library errors** — OpenZeppelin v5
   (`OwnableUnauthorizedAccount`, `ERC20InsufficientBalance`,
   `AccessControlUnauthorizedAccount`, ERC721/1155, proxies, ECDSA, SafeERC20),
   plus patterns seen elsewhere. These come from base contracts that are often
   missing from a hand-pasted ABI.
3. **Solidity's built-ins** — `Error(string)` and `Panic(uint256)`, spelled out:
   `Panic: arithmetic overflow or underflow (code 0x11)`.

```json
{
  "error": "Reverted: PolicyLocked(token: 0xF300…f8C7, until: 1750000000)",
  "revert": {
    "kind": "custom",
    "name": "PolicyLocked",
    "signature": "PolicyLocked(address,uint256)",
    "selector": "0xfb7ef18a",
    "args": { "token": "0xF300…f8C7", "until": "1750000000" },
    "decodedFrom": "contract ABI",
    "data": "0xfb7ef18a…"
  }
}
```

Two details that matter in practice:

- **Nothing is swallowed.** An unrecognised selector still reports the selector,
  the raw data, the error types your ABI *does* declare, and where to look it up.
- **Wallets often drop the revert payload** when gas estimation fails. When none
  comes back, the same call is replayed as an `eth_call` with the correct `from`
  — most reverts are `msg.sender` checks — purely to recover a decodable error.
  This runs only *after* a failure, so it never blocks or double-prompts a send.

---

## Networks and RPC endpoints

Five networks ship built in: Ethereum, Sepolia, Holesky, Polygon and MOBIUS.
Add your own from the wallet menu with **+ Add network**:

- **You never type a chain ID** — it is read from the node with `eth_chainId`.
- **An optional explorer URL** is passed to `wallet_addEthereumChain`, so
  MetaMask links transactions correctly, and the address in the menu becomes a
  link.
- **Adding an endpoint for a chain that already exists appends to it** rather
  than creating a duplicate network. The most recently added endpoint is the one
  reads go through.

The store is a **bounded MRU cache** — 5 endpoints per chain, 25 added networks.
Past a cap the least recently used entry is evicted, so storage cannot grow
without limit; 1000 additions settle at roughly 5 KB. Built-in endpoints are
never evicted, so a chain always keeps a working fallback, and switching to a
network marks it recently used so it survives eviction. Caps are re-applied on
load, repairing oversized or hand-edited storage.

The network list is searchable by name, decimal or hex chain ID, and renders at
most 50 rows however long the list is.

**RPC URLs are validated before use.** The one worth knowing about: a page served
over `https` cannot fetch an `http://` endpoint — the browser blocks it as mixed
content, which surfaces as an unexplained network error. That is rejected up
front (`localhost` exempted, since browsers allow it). `wss://`, missing schemes
and embedded credentials are rejected with reasons, and HTTP statuses are mapped
to causes: 401/403 → check the API key, 429 → rate limited, 404 → check the path.
Requests time out after 10s.

---

## Themes

Two designed palettes, not an inversion of one. A switch in the navbar chooses;
**dark is the default** and the choice is remembered.

| | Ground | Accent | Read | Write | Type |
| --- | --- | --- | --- | --- | --- |
| **Signal Desk** (dark) | `#0D1317` | `#33BD9A` | mint | amber | IBM Plex Sans / Mono |
| **Blueprint** (light) | `#EFF2F7` + grid | `#3665D4` | teal | rust | Chivo / IBM Plex Sans / JetBrains Mono |

Both are defined entirely as CSS custom properties in
[`src/index.css`](src/index.css) — 38 tokens, each defined in both blocks, and no
colour is hardcoded anywhere else. Every foreground/background pair clears WCAG
AA for normal text (lowest ratio 4.51). Results stay on a dark code panel in
both themes, because JSON needs the contrast even on paper.

To retheme, edit the two token blocks; components need no changes.

---

## Project layout

```text
src/
├── lib/
│   ├── abiInput.js       Typed argument parsing: tokeniser, coercion, formatting
│   ├── abiValidation.js   Address + ABI validation, normalisation, code check
│   ├── abiValues.js       BigInt → string, tuple field names (shared)
│   ├── calldata.js        Raw calldata validation and decode preview
│   ├── events.js          Receipt log decoding
│   ├── revert.js          Revert data recovery + decoding, known-error registry
│   ├── networks.js        Network registry, bounded MRU store, JSON-RPC helper
│   ├── useNetworks.js     Network state hook
│   └── useTheme.js        Theme state hook
└── components/
    ├── ContractForm.jsx     Address + ABI entry and validation
    ├── FunctionExecutor.jsx Filter, function rows, execution, results
    ├── RawCalldata.jsx      Pre-encoded calldata sender
    ├── WalletConnect.jsx    Connect, chain switching, add network
    ├── NetworkPicker.jsx    Searchable, bounded network list
    ├── VerifyTx.jsx         Transaction lookup
    ├── ThemeToggle.jsx      Dark/light switch
    └── CopyButton.jsx       Clipboard with a non-secure-context fallback
```

The `lib` modules hold no React and are the place logic belongs; components wire
them to the DOM.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Dev server on port 3000 |
| `npm test` | Jest + React Testing Library, watch mode |
| `CI=true npm test` | Single run, for CI |
| `npm run build` | Production bundle in `build/` |

42 tests across 5 suites cover the argument parser end to end, revert decoding,
the filter and Clear behaviour, the bounded network store at 1000-item scale, the
calldata preview, and the theme switch.

---

## Stored state

Everything is per-browser `localStorage`; nothing leaves the machine except
JSON-RPC calls to the endpoint you choose.

| Key | Contents |
| --- | --- |
| `contractData` | Last loaded address and ABI |
| `networks.overlays.v1` | Added networks and RPC endpoints |
| `ui.theme.v1` | `dark` or `light` |

Reads and writes are guarded, so a blocked or full store degrades to
in-memory-only rather than failing.

---

## Limits and known gaps

- **No `value` field.** Payable functions can be called, but not with ETH
  attached. Use the raw calldata row plus a wallet-side transfer if you need it.
- **No ENS resolution** for the contract address; parameters of type `address`
  do pass names through to the provider.
- **No explicit endpoint picker.** The most recently added endpoint for a chain
  is the active one; re-adding a URL promotes it. Endpoints and networks age out
  by MRU eviction rather than being deleted by hand.
- **Overloaded functions** are listed separately and keyed by signature, but the
  UI shows only the name in the row header.
- **Library-level test suites** (ABI parsing, revert decoding, network store)
  were run outside the repo during development; only the React suites are
  committed. Porting them into `src/lib/*.test.js` is the obvious next step.
