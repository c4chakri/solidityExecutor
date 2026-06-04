import React, { useEffect, useState } from 'react';
import ContractForm from './components/ContractForm';
import FunctionExecutor from './components/FunctionExecutor';
import VerifyTx from './components/VerifyTx';
import WalletConnect, { NETWORKS } from './components/WalletConnect';

export default function App() {
  const [contractData, setContractData] = useState(null);
  const [view, setView] = useState('contract');
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [customNetworks, setCustomNetworks] = useState({});

  // RPC URL derived from the network selected in the navbar wallet
  const allNetworks = { ...NETWORKS, ...customNetworks };
  const providerUrl = chainId ? allNetworks[chainId]?.rpcUrls?.[0] : null;
  const networkName = chainId ? allNetworks[chainId]?.chainName : null;

  // Load from localStorage on initial load
  useEffect(() => {
    const savedData = localStorage.getItem('contractData');
    if (savedData) {
      setContractData(JSON.parse(savedData));
    }
  }, []);

  const handleLoad = (data) => {
    localStorage.setItem('contractData', JSON.stringify(data));
    setContractData(data);
  };

  return (
    <div className="container">
      <h1>Smart Contract Interactor</h1>

      <nav className="navbar">
        <div className="nav-tabs">
          <button
            className={`nav-btn ${view === 'contract' ? 'active' : ''}`}
            onClick={() => setView('contract')}
          >
            Contract
          </button>
          <button
            className={`nav-btn ${view === 'verifyTx' ? 'active' : ''}`}
            onClick={() => setView('verifyTx')}
          >
            Verify Tx
          </button>
        </div>

        <div className="nav-wallet">
          <WalletConnect
            signer={signer}
            setSigner={setSigner}
            chainId={chainId}
            setChainId={setChainId}
            customNetworks={customNetworks}
            setCustomNetworks={setCustomNetworks}
          />
        </div>
      </nav>

      {!providerUrl && (
        <p className="network-hint">
          Connect your wallet and select a network from the top-right menu to continue.
        </p>
      )}

      {view === 'contract' && (
        <>
          <ContractForm onLoad={handleLoad} saved={contractData} />
          {contractData && (
            <FunctionExecutor
              {...contractData}
              providerUrl={providerUrl}
              signer={signer}
            />
          )}

          {contractData && (
            <button onClick={() => {
              localStorage.removeItem('contractData');
              setContractData(null);
            }} className="bg-red-600 text-white px-3 py-1 rounded">
              Clear Contract
            </button>
          )}
        </>
      )}

      {view === 'verifyTx' && (
        <VerifyTx providerUrl={providerUrl} networkName={networkName} />
      )}
    </div>
  );
}
