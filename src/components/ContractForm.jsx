import React, { useState, useEffect } from 'react';

export default function ContractForm({ onLoad, saved }) {
  const [contractAddress, setContractAddress] = useState('');
  const [abi, setAbi] = useState('');

  useEffect(() => {
    if (saved) {
      setContractAddress(saved.contractAddress);
      setAbi(JSON.stringify(saved.abi, null, 2));
    }
  }, [saved]);

  const handleLoad = () => {
    try {
      const parsedAbi = JSON.parse(abi);

      onLoad({
        contractAddress,
        abi: parsedAbi,
      });
    } catch (err) {
      alert('Invalid ABI JSON');
    }
  };

  return (
    <div className="space-y-4 mb-6">
      <input
        type="text"
        placeholder="Contract Address"
        value={contractAddress}
        onChange={e => setContractAddress(e.target.value)}
        className="w-full p-2 border rounded"
      />

      <textarea
        placeholder="Paste ABI JSON here"
        value={abi}
        onChange={e => setAbi(e.target.value)}
        rows={6}
        className="w-full p-2 border rounded font-mono text-sm"
      />

      <button
        onClick={handleLoad}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        Load Contract
      </button>
    </div>
  );
}
