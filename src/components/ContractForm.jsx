import React, { useState, useEffect } from 'react';

const networks = {
  mainnet: 'https://mainnet.infura.io/v3/YOUR_INFURA_ID',
  sepolia: 'https://sepolia.infura.io/v3/e427baed8ae44e6ba79e542b53c0a524',
  polygon: 'https://polygon-rpc.com',
};

export default function ContractForm({ onLoad, saved }) {
    const [contractAddress, setContractAddress] = useState('');
    const [abi, setAbi] = useState('');
    const [network, setNetwork] = useState('sepolia');
  
    useEffect(() => {
      if (saved) {
        setContractAddress(saved.contractAddress);
        setAbi(JSON.stringify(saved.abi, null, 2));
        setNetwork(saved.network);
      }
    }, [saved]);
  
    const handleLoad = () => {
      try {
        const parsedAbi = JSON.parse(abi);
        onLoad({
          contractAddress,
          abi: parsedAbi,
          providerUrl: networks[network],
          network,
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
        />
        <textarea
          placeholder="Paste ABI JSON here"
          value={abi}
          onChange={e => setAbi(e.target.value)}
          rows={6}
        />
        <select
          value={network}
          onChange={e => setNetwork(e.target.value)}
        >
          {Object.keys(networks).map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button onClick={handleLoad}>
          Load Contract
        </button>
      </div>
    );
  }