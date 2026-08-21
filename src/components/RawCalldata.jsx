import React, { useMemo, useState } from 'react';
import { describeCalldata, normalizeCalldata, summariseCalldata } from '../lib/calldata';
import { decodeLogs } from '../lib/events';
import { describeFailure, extractRevertData } from '../lib/revert';
import ResultBox from './ResultBox';

/**
 * Sends pre-encoded calldata straight to the contract.
 *
 * Covers what the generated forms cannot: a function missing from the ABI, a
 * fallback/receive handler, or calldata produced elsewhere that must go out
 * byte for byte.
 */
export default function RawCalldata({ contractAddress, abi, signer, explorerUrl, hidden }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => summariseCalldata(describeCalldata(abi, data)), [abi, data]);
  const isDirty = result !== null || data !== '';

  const clearAll = () => {
    setData('');
    setResult(null);
  };

  const send = async () => {
    setResult(null);

    let hex;
    try {
      hex = normalizeCalldata(data);
    } catch (err) {
      setResult({ error: err.message });
      return;
    }
    if (!signer) {
      setResult({ error: 'Wallet not connected' });
      return;
    }

    setBusy(true);
    try {
      const tx = await signer.sendTransaction({ to: contractAddress, data: hex });
      const receipt = await tx.wait();
      setResult({
        message: 'Transaction successful!',
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber ?? null,
        gasUsed: receipt?.gasUsed != null ? receipt.gasUsed.toString() : null,
        events: decodeLogs(abi, receipt?.logs),
      });
    } catch (err) {
      console.error('Raw calldata error:', err);
      setResult(await explainFailure(err, { abi, contractAddress, data: hex, signer }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="accordion-item" hidden={hidden}>
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <span className="fn-name">Raw calldata</span>
        <span className="fn-tag write">write</span>
      </div>
      {open && (
        <div className="accordion-body">
          <div className="param-field">
            <label className="param-label" htmlFor="raw-calldata">
              calldata <span className="param-type">bytes</span>
            </label>
            <textarea
              id="raw-calldata"
              className="param-input mono"
              rows={3}
              spellCheck={false}
              placeholder="0x374cf5e6…"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>

          {preview && <p className="raw-preview">Decodes to: {preview}</p>}

          <div className="fn-actions">
            <button type="button" onClick={send} className="exec-btn write" disabled={busy}>
              {busy ? 'Executing…' : 'Send'}
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

/**
 * Wallets often drop the revert payload when gas estimation fails; replaying the
 * same bytes as an `eth_call` recovers it so the revert can be decoded.
 */
async function explainFailure(err, { abi, contractAddress, data, signer }) {
  if (extractRevertData(err) || !signer) return describeFailure(err, abi);

  try {
    await signer.call({ to: contractAddress, data });
  } catch (probeErr) {
    if (extractRevertData(probeErr)) return describeFailure(probeErr, abi);
  }
  return describeFailure(err, abi);
}
