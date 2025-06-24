

import React, { useState } from 'react';
import { ethers } from 'ethers';
// import './Accordion.css'; // optional: place custom styles here

export default function FunctionExecutor({ contractAddress, abi, providerUrl }) {
  const provider = new ethers.JsonRpcProvider(providerUrl);
  const [walletProvider, setWalletProvider] = useState(null);
const [walletAddress, setWalletAddress] = useState(null);
  const contract = new ethers.Contract(contractAddress, abi, provider);
  const functions = abi.filter(f => f.type === 'function');

  const connectWallet = async () => {
    const eth = window.ethereum;
    if (!eth) return alert('MetaMask required');
    await eth.request({ method: 'eth_requestAccounts' });
    const signer = new ethers.BrowserProvider(eth).getSigner();
    setWalletProvider(signer);
    const addr= await (await signer).address;
    const truncatedAddr = addr.slice(0, 6) + '...' + addr.slice(-4);
    setWalletAddress(truncatedAddr);
  };
// console.log(walletAddress);
  return (
    <div>
        {
          !walletAddress && (
            <button onClick={connectWallet} className="bg-blue-600 text-white px-3 py-1 rounded">
              {walletAddress ? walletAddress : 'Connect Wallet'}
            </button>
          )
        }
        {
          walletAddress && (
            <button onClick={connectWallet} className="bg-blue-600 text-white px-3 py-1 rounded">
              {walletAddress ? 'Connected: ' + walletAddress : 'Connect Wallet'}
            </button>
          )
        }
      
      <div className="accordion">
        {functions.map((fn, idx) => (
          <AccordionItem
            key={idx}
            fn={fn}
            contract={contract}
            signer={walletProvider}
          />
        ))}
      </div>
    </div>
  );
}

function AccordionItem({ fn, contract, signer }) {
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);

  const handleInputChange = (i, value) => {
    setInputs(prev => ({ ...prev, [i]: value }));
  };

  const execute = async () => {
    try {
      const args = fn.inputs.map((_, i) => inputs[i]);
      const method = contract[fn.name];
  
      if (fn.stateMutability === 'view' || fn.stateMutability === 'pure') {
        const res = await method(...args);
        setResult(cleanBigInts(res)); // 👈 Fix applied here
      } else {
        if (!signer) return alert('Wallet not connected');
        const contractWithSigner = contract.connect(signer);
        const tx = await contractWithSigner[fn.name](...args);
        setResult({ txHash: tx.hash });
      }
    } catch (err) {
      setResult({ error: err.message });
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
