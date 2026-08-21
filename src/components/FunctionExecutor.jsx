import React, { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import {
  buildArgs,
  formatType,
  functionKey,
  isComplexType,
  isReadFunction,
  sampleLiteral,
} from '../lib/abiInput';
import { describeFailure, extractRevertData } from '../lib/revert';
import RawCalldata from './RawCalldata';
import ResultBox from './ResultBox';
import { decodeLogs } from '../lib/events';
import { toPlain } from '../lib/abiValues';

// Read and write flank All, matching how the two sit either side of neutral.
const FILTERS = [
  { key: 'read', label: 'Read' },
  { key: 'all', label: 'All' },
  { key: 'write', label: 'Write' },
];

export default function FunctionExecutor({ contractAddress, abi, providerUrl, signer, explorerUrl }) {
  const [filter, setFilter] = useState('all');

  // One provider per RPC URL — recreating it on every render leaks sockets.
  const provider = useMemo(
    () => (providerUrl ? new ethers.JsonRpcProvider(providerUrl) : null),
    [providerUrl]
  );
  const functions = useMemo(() => abi.filter((f) => f.type === 'function'), [abi]);

  const matchesFilter = (fn) => {
    if (filter === 'read') return isReadFunction(fn);
    if (filter === 'write') return !isReadFunction(fn);
    return true;
  };
  const visibleCount = functions.filter(matchesFilter).length;

  return (
    <div>
      <div className="fn-filter" role="group" aria-label="Filter functions">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`fn-filter-btn${filter === key ? ' active' : ''}`}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="accordion">
        {/* Filtered-out items are hidden, not unmounted: switching the filter
            must not discard input already typed into a form. Keyed by
            signature so state can never be handed to a different function. */}
        {functions.map((fn) => (
          <AccordionItem
            key={functionKey(fn)}
            fn={fn}
            hidden={!matchesFilter(fn)}
            contractAddress={contractAddress}
            abi={abi}
            provider={provider}
            signer={signer}
            explorerUrl={explorerUrl}
          />
        ))}
        {visibleCount === 0 && (
          <p className="fn-empty">
            {functions.length === 0
              ? 'This ABI declares no functions.'
              : `No ${filter} functions in this ABI.`}
          </p>
        )}

        {/* Raw calldata always writes, so Read must not list it. It stays
            available under Write even when the ABI declares no write
            functions — that is exactly when it is most useful. */}
        <RawCalldata
          contractAddress={contractAddress}
          abi={abi}
          signer={signer}
          explorerUrl={explorerUrl}
          hidden={filter === 'read'}
        />
      </div>
    </div>
  );
}

function AccordionItem({ fn, hidden, contractAddress, abi, provider, signer, explorerUrl }) {
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const isRead = isReadFunction(fn);

  const handleInputChange = (i, value) => {
    setInputs((prev) => ({ ...prev, [i]: value }));
  };

  const clearAll = () => {
    setInputs({});
    setResult(null);
  };

  // Clear is only offered once there is something to clear.
  const isDirty =
    result !== null || Object.values(inputs).some((value) => value !== '' && value != null);

  const execute = async () => {
    setResult(null);

    // Turn the typed text into the values ethers expects (tuples, arrays,
    // bools and big integers included) before touching the network.
    let args;
    try {
      args = buildArgs(fn, inputs);
    } catch (err) {
      setResult({ error: err.message });
      return;
    }

    setBusy(true);
    try {
      if (isRead) {
        if (!provider) {
          setResult({ error: 'Select a network first — no RPC URL available.' });
          return;
        }
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const res = await contract[fn.name](...args);
        setResult(toPlain(res));
      } else {
        if (!signer) {
          setResult({ error: 'Wallet not connected' });
          return;
        }
        const contractWithSigner = new ethers.Contract(contractAddress, abi, signer);
        const tx = await contractWithSigner[fn.name](...args);
        const receipt = await tx.wait();
        setResult({
          message: 'Transaction successful!',
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber ?? null,
          gasUsed: receipt?.gasUsed != null ? receipt.gasUsed.toString() : null,
          events: decodeLogs(abi, receipt?.logs),
        });
      }
    } catch (err) {
      console.error('Execution error:', err);
      setResult(await explainFailure(err, { fn, args, abi, contractAddress, provider, signer }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="accordion-item" hidden={hidden}>
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <span className="fn-name">{fn.name}</span>
        <span className={`fn-tag ${isRead ? 'read' : 'write'}`}>{isRead ? 'read' : 'write'}</span>
      </div>
      {open && (
        <div className="accordion-body">
          {fn.inputs.map((input, i) => (
            <ParamField
              key={i}
              param={input}
              index={i}
              value={inputs[i] ?? ''}
              onChange={handleInputChange}
            />
          ))}

          <div className="fn-actions">
            <button
              type="button"
              onClick={execute}
              className={`exec-btn ${isRead ? 'read' : 'write'}`}
              disabled={busy}
            >
              {busy ? 'Executing…' : isRead ? 'Call' : 'Send'}
            </button>
            {isDirty && (
              <button type="button" onClick={clearAll} className="clear-btn" disabled={busy}>
                Clear
              </button>
            )}
          </div>

          {result && <ResultBox result={result} explorerUrl={explorerUrl} />}
        </div>
      )}
    </div>
  );
}

function ParamField({ param, index, value, onChange }) {
  const complex = isComplexType(param.type);
  const name = param.name || `arg${index}`;

  return (
    <div className="param-field">
      <label className="param-label" htmlFor={`param-${name}-${index}`}>
        {name} <span className="param-type">{formatType(param)}</span>
      </label>
      {complex ? (
        <textarea
          id={`param-${name}-${index}`}
          className="param-input mono"
          rows={2}
          spellCheck={false}
          placeholder={sampleLiteral(param)}
          value={value}
          onChange={(e) => onChange(index, e.target.value)}
        />
      ) : (
        <input
          id={`param-${name}-${index}`}
          type="text"
          className="param-input"
          spellCheck={false}
          placeholder={param.type}
          value={value}
          onChange={(e) => onChange(index, e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * Decodes the revert against the ABI. Wallets often drop the revert payload
 * when gas estimation fails, so if none came back we replay the same call as an
 * `eth_call` — which does return it — purely to get a decodable error.
 */
async function explainFailure(err, { fn, args, abi, contractAddress, provider, signer }) {
  if (extractRevertData(err)) return describeFailure(err, abi);

  const runner = provider || signer;
  const isRead = isReadFunction(fn);
  if (isRead || !runner) return describeFailure(err, abi);

  try {
    const probe = new ethers.Contract(contractAddress, abi, runner);
    const from = await resolveFrom(signer);
    // `from` matters: most reverts are access-control checks on msg.sender.
    await probe[fn.name].staticCall(...args, ...(from ? [{ from }] : []));
  } catch (probeErr) {
    if (extractRevertData(probeErr)) return describeFailure(probeErr, abi);
  }
  return describeFailure(err, abi);
}

async function resolveFrom(signer) {
  try {
    return signer ? await signer.getAddress() : null;
  } catch {
    return null;
  }
}
