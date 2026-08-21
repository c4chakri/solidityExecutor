import React, { useEffect, useState } from 'react';
import ContractForm from './components/ContractForm';
import FunctionExecutor from './components/FunctionExecutor';
import VerifyTx from './components/VerifyTx';
import WalletConnect from './components/WalletConnect';
import ThemeToggle from './components/ThemeToggle';
import { useNetworks } from './lib/useNetworks';
import { useTheme } from './lib/useTheme';

export default function App() {
  const [contractData, setContractData] = useState(null);
  const [view, setView] = useState('contract');
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const { networks, rpcUrlFor, addRpc, touch } = useNetworks();
  const { theme, selectTheme } = useTheme();

  // RPC URL derived from the network + endpoint selected in the navbar wallet
  const providerUrl = rpcUrlFor(chainId);
  const networkName = chainId ? networks[chainId]?.chainName : null;

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

        <div className="nav-right">
          <ThemeToggle theme={theme} selectTheme={selectTheme} />
          <div className="nav-wallet">
            <WalletConnect
              signer={signer}
              setSigner={setSigner}
              chainId={chainId}
              setChainId={setChainId}
              networks={networks}
              addRpc={addRpc}
              touch={touch}
            />
          </div>
        </div>
      </nav>

      {view === 'contract' && (
        <>
          <ContractForm
            onLoad={handleLoad}
            saved={contractData}
            providerUrl={providerUrl}
            networkName={networkName}
          />
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
            }} className="danger-btn">
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
