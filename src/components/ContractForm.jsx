import React, { useState, useEffect } from 'react';
import CopyButton from './CopyButton';
import { abiOneLine, checkContractExists, parseAbiInput, validateAddress } from '../lib/abiValidation';

export default function ContractForm({ onLoad, saved, providerUrl, networkName }) {
  const [contractAddress, setContractAddress] = useState('');
  const [abi, setAbi] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    if (!saved) return;
    setContractAddress(saved.contractAddress);
    setAbi(abiOneLine(saved.abi));
  }, [saved]);

  const handleLoad = async () => {
    setError('');
    setWarnings([]);

    let address;
    let parsed;
    try {
      address = validateAddress(contractAddress);
      parsed = parseAbiInput(abi);
    } catch (err) {
      setError(err.message);
      return;
    }

    // Normalised: human-readable input and legacy `constant` flags become
    // canonical JSON fragments, so everything downstream sees one shape. It
    // goes back into the field on one line, which stays editable.
    setContractAddress(address);
    setAbi(abiOneLine(parsed.abi));
    setWarnings(parsed.warnings);
    onLoad({ contractAddress: address, abi: parsed.abi });

    // Non-blocking: the contract loads either way.
    const missing = await checkContractExists(address, providerUrl, networkName);
    if (missing) setWarnings((prev) => [missing, ...prev]);
  };

  return (
    <div className="contract-form">
      <label className="field-label" htmlFor="contract-address">
        Contract address
      </label>
      <div className="field-row">
        <input
          id="contract-address"
          type="text"
          placeholder="0x…"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
          className="form-input"
          spellCheck={false}
        />
        <CopyButton value={contractAddress} label="address" />
      </div>

      <label className="field-label" htmlFor="contract-abi">
        ABI
      </label>
      <div className="field-row">
        {/* One line, scrolling sideways rather than wrapping, so the field
            stays the height of the address above it — and stays editable. */}
        <textarea
          id="contract-abi"
          placeholder="Paste the ABI JSON, a build artifact, or one signature per line"
          value={abi}
          onChange={(e) => setAbi(e.target.value)}
          rows={1}
          wrap="off"
          className="form-textarea one-line"
          spellCheck={false}
        />
        <CopyButton value={abi} label="ABI" />
      </div>

      <button type="button" onClick={handleLoad} className="primary-btn">
        Load Contract
      </button>

      {error && <p className="form-error">{error}</p>}
      {warnings.map((warning) => (
        <p key={warning} className="form-warning">
          {warning}
        </p>
      ))}
    </div>
  );
}
