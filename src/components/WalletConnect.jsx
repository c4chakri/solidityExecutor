import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';

// Supported networks for switching, keyed by hex chainId
export const NETWORKS = {
  '0x1': {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    rpcUrls: ['https://eth.llamarpc.com'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://etherscan.io'],
  },
  '0xaa36a7': {
    chainId: '0xaa36a7',
    chainName: 'Sepolia',
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  '0x4268': {
    chainId: '0x4268',
    chainName: 'Holesky',
    rpcUrls: ['https://ethereum-holesky-rpc.publicnode.com'],
    nativeCurrency: { name: 'Holesky Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://holesky.etherscan.io'],
  },
  '0x89': {
    chainId: '0x89',
    chainName: 'Polygon',
    rpcUrls: ['https://polygon-rpc.com'],
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    blockExplorerUrls: ['https://polygonscan.com'],
  },
  '0xc73b': {
    chainId: '0xc73b',
    chainName: 'MOBIUS',
    rpcUrls: ['https://besu-rpc.gov-cloud.ai'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

export default function WalletConnect({
  signer,
  setSigner,
  chainId,
  setChainId,
  customNetworks = {},
  setCustomNetworks,
}) {
  const [walletAddress, setWalletAddress] = useState(null);
  const [fullAddress, setFullAddress] = useState(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customRpc, setCustomRpc] = useState('');
  const [customChainId, setCustomChainId] = useState('');
  const ref = useRef(null);

  // All networks = built-in presets + user-added custom ones
  const allNetworks = { ...NETWORKS, ...customNetworks };

  // Close the dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Refresh the signer + connection state from the current wallet
  const refreshConnection = async () => {
    const eth = window.ethereum;
    if (!eth) return;
    const browserProvider = new ethers.BrowserProvider(eth);
    const newSigner = await browserProvider.getSigner();
    const net = await browserProvider.getNetwork();
    setSigner(newSigner);
    setChainId('0x' + net.chainId.toString(16));
    const addr = await newSigner.getAddress();
    setFullAddress(addr);
    setWalletAddress(addr.slice(0, 6) + '...' + addr.slice(-4));
  };

  // Keep state in sync when the user switches network/account in MetaMask
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth || !walletAddress) return;

    const onChainChanged = () => refreshConnection();
    const onAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        disconnect();
      } else {
        refreshConnection();
      }
    };

    eth.on('chainChanged', onChainChanged);
    eth.on('accountsChanged', onAccountsChanged);
    return () => {
      eth.removeListener('chainChanged', onChainChanged);
      eth.removeListener('accountsChanged', onAccountsChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const connectWallet = async () => {
    try {
      const eth = window.ethereum;
      if (!eth) return alert('MetaMask required');
      await eth.request({ method: 'eth_requestAccounts' });
      await refreshConnection();
    } catch (err) {
      console.error('Wallet connection error:', err);
      alert('Failed to connect wallet');
    }
  };

  const switchNetwork = async (targetChainId) => {
    const eth = window.ethereum;
    if (!eth) return;
    setSwitching(true);
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainId }],
      });
      // refreshConnection runs via the chainChanged listener,
      // but call it too in case the event doesn't fire.
      await refreshConnection();
    } catch (err) {
      // 4902 = chain not added to the wallet yet -> add it, then switch
      if (err.code === 4902 && allNetworks[targetChainId]) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [allNetworks[targetChainId]],
          });
          await refreshConnection();
        } catch (addErr) {
          console.error('Add network error:', addErr);
          alert('Failed to add network');
        }
      } else {
        console.error('Switch network error:', err);
        alert('Failed to switch network');
      }
    } finally {
      setSwitching(false);
    }
  };

  const addCustomNetwork = async () => {
    // Validate chain ID
    const idNum = Number(customChainId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      alert('Please enter a valid numeric chain ID');
      return;
    }
    // Validate RPC URL
    try {
      new URL(customRpc);
    } catch {
      alert('Please enter a valid RPC URL');
      return;
    }

    const hexId = '0x' + idNum.toString(16);
    const net = {
      chainId: hexId,
      chainName: customName.trim() || `Custom ${idNum}`,
      rpcUrls: [customRpc.trim()],
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    };

    setCustomNetworks((prev) => ({ ...prev, [hexId]: net }));
    setShowCustom(false);
    setCustomName('');
    setCustomRpc('');
    setCustomChainId('');
    await switchNetwork(hexId);
  };

  const disconnect = () => {
    setSigner(null);
    setWalletAddress(null);
    setFullAddress(null);
    setChainId(null);
    setOpen(false);
  };

  if (!signer || !walletAddress) {
    return (
      <button className="wallet-btn" onClick={connectWallet}>
        Connect Wallet
      </button>
    );
  }

  const currentNet = allNetworks[chainId];
  const networkLabel = currentNet
    ? currentNet.chainName
    : chainId
    ? `Chain ${parseInt(chainId, 16)}`
    : 'Unknown';

  return (
    <div className="wallet-menu" ref={ref}>
      <button className="wallet-btn connected" onClick={() => setOpen(!open)}>
        <span className="wallet-dot" />
        {networkLabel + ' : ' + walletAddress}
        <span className="wallet-caret">▾</span>
      </button>

      {open && (
        <div className="wallet-dropdown">
          <div className="wallet-row">
            <span className="wallet-label">Address</span>
            <span className="wallet-value mono">{fullAddress}</span>
          </div>

          <label className="wallet-label" htmlFor="network-select" style={{ display: 'block', margin: '10px 0 4px' }}>
            Network
          </label>
          <select
            id="network-select"
            className="wallet-select"
            value={showCustom ? '__custom__' : currentNet ? chainId : ''}
            disabled={switching}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setShowCustom(true);
              } else {
                setShowCustom(false);
                switchNetwork(e.target.value);
              }
            }}
          >
            {!currentNet && (
              <option value="" disabled>
                {networkLabel} (unsupported)
              </option>
            )}
            {Object.values(allNetworks).map((n) => (
              <option key={n.chainId} value={n.chainId}>
                {n.chainName}
              </option>
            ))}
            <option value="__custom__">+ Add custom RPC…</option>
          </select>
          {switching && <p className="wallet-switching">Switching network…</p>}

          {showCustom && (
            <div className="wallet-custom">
              <input
                className="wallet-select"
                type="text"
                placeholder="Network name (optional)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <input
                className="wallet-select"
                type="text"
                placeholder="Chain ID (e.g. 51003)"
                value={customChainId}
                onChange={(e) => setCustomChainId(e.target.value)}
              />
              <input
                className="wallet-select"
                type="url"
                placeholder="RPC URL (https://...)"
                value={customRpc}
                onChange={(e) => setCustomRpc(e.target.value)}
              />
              <button
                className="wallet-add"
                onClick={addCustomNetwork}
                disabled={switching}
              >
                Add &amp; Switch
              </button>
            </div>
          )}

          <button className="wallet-disconnect" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
