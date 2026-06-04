import React, { useState } from 'react';
import { ethers } from 'ethers';

export default function FunctionExecutor({ contractAddress, abi, providerUrl, signer }) {
  const provider = providerUrl ? new ethers.JsonRpcProvider(providerUrl) : null;
  const functions = abi.filter(f => f.type === 'function');

  return (
    <div>
      <div className="accordion">
        {functions.map((fn, idx) => (
          <AccordionItem
            key={idx}
            fn={fn}
            contractAddress={contractAddress}
            abi={abi}
            provider={provider}
            signer={signer}
          />
        ))}
      </div>
    </div>
  );
}

function AccordionItem({ fn, contractAddress, abi, provider, signer }) {
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);

  const handleInputChange = (i, value) => {
    setInputs(prev => ({ ...prev, [i]: value }));
  };

  const execute = async () => {
    try {
      const args = fn.inputs.map((_, i) => inputs[i]);
      
      if (fn.stateMutability === 'view' || fn.stateMutability === 'pure') {
        // For read-only functions, use the provider
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const res = await contract[fn.name](...args);
        setResult(cleanBigInts(res));
      } else {
        // For write functions, use the signer
        if (!signer) return alert('Wallet not connected');
        const contractWithSigner = new ethers.Contract(contractAddress, abi, signer);
        const tx = await contractWithSigner[fn.name](...args);
        await tx.wait(); // Wait for transaction to be mined
        setResult({ 
          txHash: tx.hash,
          message: 'Transaction successful!'
        });
      }
    } catch (err) {
      console.error('Execution error:', err);
      setResult({ error: err.message || 'Transaction failed' });
    }
  };
  
  function cleanBigInts(value) {
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map(cleanBigInts);
    if (value && typeof value === 'object') {
      const clean = {};
      for (const key in value) {
        clean[key] = cleanBigInts(value[key]);
      }
      return clean;
    }
    return value;
  }
  
  return (
    <div className="accordion-item">
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <span>{fn.name}</span>
        <button className="json-btn">Try</button>
      </div>
      {open && (
        <div className="accordion-body">
          {fn.inputs.map((input, i) => (
            <input
              key={i}
              type="text"
              placeholder={`${input.name} (${input.type})`}
              onChange={e => handleInputChange(i, e.target.value)}
            />
          ))}
          <button onClick={execute} className="exec-btn">
            {fn.stateMutability === 'view' || fn.stateMutability === 'pure' ? 'Call' : 'Send'}
          </button>
          {result && (
            <pre className="result-box">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}