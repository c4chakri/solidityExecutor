import React, { useState, useEffect } from 'react';

const networks = {
  mainnet: 'https://mainnet.infura.io/v3/YOUR_INFURA_ID',
  sepolia: 'https://sepolia.infura.io/v3/e427baed8ae44e6ba79e542b53c0a524',
  polygon: 'https://polygon-rpc.com',
  holesky: 'https://ethereum-holesky-rpc.publicnode.com',
  custom: 'custom', // Special flag for custom network
};

export default function ContractForm({ onLoad, saved }) {
  const [contractAddress, setContractAddress] = useState('');
  const [abi, setAbi] = useState('');
  const [network, setNetwork] = useState('sepolia');
  const [customRpc, setCustomRpc] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  useEffect(() => {
    if (saved) {
      setContractAddress(saved.contractAddress);
      setAbi(JSON.stringify(saved.abi, null, 2));
      setNetwork(saved.network);
      
      // Check if it was a custom network and set the custom RPC
      if (saved.network === 'custom' && saved.customRpc) {
        setCustomRpc(saved.customRpc);
        setShowCustomInput(true);
      }
    }
  }, [saved]);

  const handleNetworkChange = (e) => {
    const selectedNetwork = e.target.value;
    setNetwork(selectedNetwork);
    setShowCustomInput(selectedNetwork === 'custom');
    
    // Clear custom RPC when switching away from custom
    if (selectedNetwork !== 'custom') {
      setCustomRpc('');
    }
  };

  const handleLoad = () => {
    try {
      const parsedAbi = JSON.parse(abi);
      
      // Determine the provider URL
      let providerUrl;
      if (network === 'custom') {
        if (!customRpc) {
          alert('Please enter a custom RPC URL');
          return;
        }
        // Basic URL validation
        try {
          new URL(customRpc);
        } catch {
          alert('Please enter a valid RPC URL');
          return;
        }
        providerUrl = customRpc;
      } else {
        providerUrl = networks[network];
      }

      onLoad({
        contractAddress,
        abi: parsedAbi,
        providerUrl,
        network,
        ...(network === 'custom' && { customRpc }), // Include customRpc only for custom networks
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
      
      <select
        value={network}
        onChange={handleNetworkChange}
        className="w-full p-2 border rounded"
      >
        {Object.keys(networks).map(n => (
          <option key={n} value={n}>
            {n.charAt(0).toUpperCase() + n.slice(1)}
          </option>
        ))}
      </select>

      {/* Custom RPC input field - only shown when "custom" is selected */}
      {showCustomInput && (
        <div className="space-y-2">
          <input
            type="url"
            placeholder="Enter custom RPC URL (e.g., https://your-rpc-url.com)"
            value={customRpc}
            onChange={e => setCustomRpc(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <p className="text-xs text-gray-500">
            Example: https://mainnet.infura.io/v3/your-project-id or any other RPC endpoint
          </p>
        </div>
      )}

      <button 
        onClick={handleLoad}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        Load Contract
      </button>
    </div>
  );
}