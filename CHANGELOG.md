# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — 2026-08-21

A correctness and usability release. Any function taking a `tuple` or an array
was impossible to call before this; reverts and events were largely opaque; and
the network store could grow without limit. All three are fixed, and the UI has
two designed themes.

### Added

- **Typed argument parsing** (`src/lib/abiInput.js`). Each field is coerced
  against its ABI type before the call. Tuples, nested tuples, fixed and dynamic
  arrays, arrays of structs, `bool`, `bytesN` and every integer width are
  supported. Accepts positional (`[true, 2]`), parenthesised (`(true, 2)`) and
  named (`{ active: true, tier: 2 }`) forms, unquoted hex and addresses, and
  single or double quotes.
- **Decoded events on transaction results** (`src/lib/events.js`). Receipt logs
  are decoded against the ABI with named arguments. Logs emitted by other
  contracts in the same call are reported by address, topics and data rather
  than dropped.
- **Revert decoding** (`src/lib/revert.js`). Revert data is recovered from the
  provider error and decoded against the contract ABI, a registry of ~60 common
  library errors (OpenZeppelin v5, ERC721/1155, proxies, ECDSA, SafeERC20), and
  Solidity's `Error(string)` / `Panic(uint256)`. Panic codes are spelled out.
  When gas estimation drops the payload, the call is replayed as an `eth_call`
  with the correct `from` purely to recover a decodable error.
- **Raw calldata sender** (`src/components/RawCalldata.jsx`). Sends pre-encoded
  bytes to the contract for functions missing from the ABI or `fallback` /
  `receive` handlers, decoding the calldata for confirmation before sending.
- **Address and ABI validation** (`src/lib/abiValidation.js`). Checksummed
  addresses with per-cause messages; ABI fragments validated one at a time;
  build artifacts (Hardhat / Foundry / Truffle / solc) and human-readable
  signatures accepted and normalised to canonical JSON fragments. Non-blocking
  warnings for an ABI with no error types, no functions or duplicate signatures,
  plus a live `eth_getCode` check that the address holds a contract on the
  selected network.
- **Read / All / Write filter** over the function list, with read and write
  distinguished by colour throughout the UI.
- **Two themes**: Signal Desk (dark, default) and Blueprint (light), selected by
  a switch in the navbar and remembered. 38 CSS custom properties defined in
  both palettes; every foreground/background pair clears WCAG AA for normal
  text.
- **Searchable network picker** (`src/components/NetworkPicker.jsx`), filtering
  by name, decimal or hex chain ID, with a bounded render.
- **Chain ID auto-detection** when adding a network, read from the node with
  `eth_chainId`, plus an optional block explorer URL that is passed to
  `wallet_addEthereumChain`.
- **Copy buttons** for the address, chain ID, RPC URL and ABI, with a fallback
  for non-secure contexts where the Clipboard API is unavailable.
- **Per-function Clear**, shown only when there is input or a result to clear.
- Component test suites: 42 tests across 5 files covering the filter, Clear,
  the calldata preview, the network picker at 1000-item scale, the theme switch
  and ABI entry.

### Changed

- Networks are stored as **overlays merged over the built-in presets**, so adding
  an endpoint for a known chain appends to that chain instead of creating a
  duplicate entry. The store is a bounded MRU cache — 5 endpoints per chain, 25
  added networks — with built-in endpoints never evicted and caps re-applied on
  load. 1000 additions settle at roughly 5 KB of `localStorage`.
- Adding a network no longer asks for a chain ID.
- The RPC endpoint list was replaced by a copy button on the active endpoint; the
  most recently added endpoint for a chain is the one reads go through.
- `alert()` was replaced with inline errors and warnings throughout.
- Read results, event arguments and revert arguments share one converter
  (`src/lib/abiValues.js`), so all three render `BigInt` and named tuple fields
  identically. Nested tuples are keyed by component name rather than position.
- The ABI field is a single line that scrolls, holding the normalised ABI and
  remaining editable.
- `Ethereum Mainnet` is now labelled `Ethereum`.
- Deprecated `constant` / `payable` duplicates of `stateMutability` are stripped
  from the normalised ABI.
- Scrollbars, status badges and every other colour are driven by theme tokens.

### Fixed

- **`invalid tuple value` on any function taking a tuple or array.** Arguments
  were passed to ethers as raw strings, so a `tuple` parameter received the text
  `"[true, 2, …]"` instead of an array. The same bug affected `bool` (a `"false"`
  string is truthy), all array types, and `uint256` values above
  `Number.MAX_SAFE_INTEGER`, which lost precision through `JSON.parse`.
- **ABI fragments were silently discarded.** `new ethers.Interface(abi)` logs and
  drops an unparseable fragment rather than rejecting it, so a contract could
  load with functions quietly missing. Fragments are now validated individually
  and rejections reported by position and name.
- **Raw calldata appeared under the Read filter** despite always being a write —
  it was rendered outside the filter's scope.
- **Filtering discarded typed input.** Filtered-out rows were unmounted, so
  switching filters cleared any form in progress. Rows are hidden instead, and
  keyed by signature so state can never be handed to a different function.
- **`http://` RPC endpoints failed with no explanation** on an `https` page,
  where the browser blocks them as mixed content. This is now rejected up front
  with the reason (`localhost` exempted).
- **A wrong-length address and a bad checksum reported the same cause.** They are
  now distinguished.
- The JSON-RPC provider was rebuilt on every render, leaking sockets.
- `scrollIntoView` is not implemented in every environment; keyboard navigation
  in the network picker threw where it is missing.
- MetaMask nests error code `4902` under `err.data.originalError`, so the
  add-chain fallback did not fire in some cases.
- An empty `blockExplorerUrls` array was sent to `wallet_addEthereumChain`,
  which MetaMask rejects.
- The global form-control reset forced `width: 100%` and margins onto every
  input and button, fighting every flex layout. `body` carried 8rem of padding
  on all sides.
- `VerifyTx` used hardcoded status colours that ignored the active theme.

### Removed

- Dead Create React App scaffolding: `src/App.css`, `src/logo.svg`,
  `src/logo copy.svg`, and the boilerplate `src/App.test.js`, which asserted the
  page contained the text "learn react" and had never passed.
- Tailwind-style class names (`w-full`, `p-2`, `bg-red-600`) that did nothing —
  Tailwind is not installed.

### Notes

- `eslintConfig.env.es2020` was added to `package.json`; the default Create React
  App lint config does not recognise the `BigInt` global that precise integer
  handling requires.
- Google Fonts (IBM Plex Sans/Mono, Chivo, JetBrains Mono) are loaded from
  `public/index.html`, each with a real fallback stack.

## [0.1.0] — 2026-06-04

Initial working version.

### Added

- Load a contract by address and ABI, persisted in `localStorage`.
- Accordion of ABI functions with `Call` for `view` / `pure` and `Send` for
  state-changing functions.
- Wallet connection via MetaMask, with network switching and a custom RPC entry.
- Built-in network presets: Ethereum, Sepolia, Holesky, Polygon, MOBIUS.
- Verify Tx tab for looking up a transaction hash.

[0.1.2]: https://github.com/c4chakri/solidityExecutor/releases/tag/v0.1.2
[0.1.0]: https://github.com/c4chakri/solidityExecutor/commit/a68420c
