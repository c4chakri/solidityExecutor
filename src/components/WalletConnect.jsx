import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import CopyButton from './CopyButton';
import NetworkPicker from './NetworkPicker';
import {
  activeRpcUrl,
  chainIdToDecimal,
  explorerLink,
  shortenUrl,
  toWalletChainParams,
} from '../lib/networks';

export default function WalletConnect({
  signer,
  setSigner,
  chainId,
  setChainId,
  networks,
  addRpc,
  touch,
}) {
  const [walletAddress, setWalletAddress] = useState(null);
  const [fullAddress, setFullAddress] = useState(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [menuError, setMenuError] = useState('');

  const [showAddRpc, setShowAddRpc] = useState(false);
  const [rpcName, setRpcName] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [explorerUrl, setExplorerUrl] = useState('');
  const [addingRpc, setAddingRpc] = useState(false);
  const [addError, setAddError] = useState('');

  const ref = useRef(null);

  // Close the dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Refresh the signer + connection state from the current wallet
  const refreshConnection = useCallback(async () => {
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
  }, [setSigner, setChainId]);

  const disconnect = useCallback(() => {
    setSigner(null);
    setWalletAddress(null);
    setFullAddress(null);
    setChainId(null);
    setOpen(false);
  }, [setSigner, setChainId]);

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
  }, [walletAddress, refreshConnection, disconnect]);

  const connectWallet = async () => {
    try {
      const eth = window.ethereum;
      if (!eth) return setMenuError('MetaMask required');
      await eth.request({ method: 'eth_requestAccounts' });
      await refreshConnection();
    } catch (err) {
      console.error('Wallet connection error:', err);
      setMenuError(err.code === 4001 ? 'Connection rejected' : 'Failed to connect wallet');
    }
  };

  /**
   * Switches the wallet to `targetChainId`, adding the chain first if the wallet
   * does not know it yet. `netOverride` covers the just-added case, where our
   * `networks` prop has not re-rendered with the new entry yet.
   */
  const switchNetwork = async (targetChainId, netOverride) => {
    const eth = window.ethereum;
    if (!eth) return;
    const net = netOverride || networks[targetChainId];
    setSwitching(true);
    setMenuError('');
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainId }],
      });
      // refreshConnection runs via the chainChanged listener,
      // but call it too in case the event doesn't fire.
      await refreshConnection();
      touch(targetChainId);
    } catch (err) {
      // 4902 = chain not added to the wallet yet -> add it, then switch
      const notAdded = err.code === 4902 || err.data?.originalError?.code === 4902;
      if (notAdded && net) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [toWalletChainParams(net)],
          });
          await refreshConnection();
          touch(targetChainId);
        } catch (addErr) {
          console.error('Add network error:', addErr);
          setMenuError(
            addErr.code === 4001 ? 'Network request rejected' : 'Failed to add network to wallet'
          );
        }
      } else {
        console.error('Switch network error:', err);
        setMenuError(err.code === 4001 ? 'Network switch rejected' : 'Failed to switch network');
      }
    } finally {
      setSwitching(false);
    }
  };

  /** Chain ID comes from the node itself — the user only supplies the URLs. */
  const submitRpc = async () => {
    setAddError('');
    setAddingRpc(true);
    try {
      const added = await addRpc({ rpcUrl, chainName: rpcName, explorerUrl });

      setRpcUrl('');
      setRpcName('');
      setExplorerUrl('');
      setShowAddRpc(false);
      await switchNetwork(added.chainId, added.network);
    } catch (err) {
      setAddError(err.message || 'Could not add that endpoint');
    } finally {
      setAddingRpc(false);
    }
  };

  const toggleAddRpc = () => {
    setShowAddRpc((prev) => {
      if (prev) {
        setRpcName('');
        setRpcUrl('');
        setExplorerUrl('');
      }
      return !prev;
    });
    setAddError('');
  };

  if (!signer || !walletAddress) {
    return (
      <div className="wallet-menu">
        <button type="button" className="wallet-btn" onClick={connectWallet}>
          Connect Wallet
        </button>
        {menuError && <span className="wallet-error">{menuError}</span>}
      </div>
    );
  }

  const currentNet = networks[chainId];
  const networkLabel =
    currentNet?.chainName || (chainId ? `Chain ${chainIdToDecimal(chainId)}` : 'Unknown');
  const currentRpc = activeRpcUrl(currentNet);
  const addressLink = explorerLink(currentNet, 'address', fullAddress);

  return (
    <div className="wallet-menu" ref={ref}>
      <button type="button" className="wallet-btn connected" onClick={() => setOpen(!open)}>
        <span className="wallet-dot" />
        {networkLabel + ' : ' + walletAddress}
        <span className="wallet-caret">▾</span>
      </button>

      {open && (
        <div className="wallet-dropdown">
          <div className="wallet-row">
            <span className="wallet-label">Address</span>
            <span className="wallet-value mono">
              {addressLink ? (
                <a href={addressLink} target="_blank" rel="noreferrer">
                  {fullAddress}
                </a>
              ) : (
                fullAddress
              )}
              <CopyButton value={fullAddress} label="address" />
            </span>
          </div>

          <div className="wallet-row">
            <span className="wallet-label">Chain ID</span>
            <span className="wallet-value mono">
              {chainIdToDecimal(chainId)}
              <CopyButton value={chainIdToDecimal(chainId)} label="chain ID" />
            </span>
          </div>

          <div className="wallet-row">
            <span className="wallet-label">RPC</span>
            <span className="wallet-value mono" title={currentRpc || 'none configured'}>
              {currentRpc ? shortenUrl(currentRpc) : 'none configured'}
              <CopyButton value={currentRpc} label="RPC URL" />
            </span>
          </div>

          {/* The form takes over the list's space rather than stacking below it. */}
          {showAddRpc ? (
            <div className="wallet-custom">
              <input
                className="wallet-select"
                type="text"
                placeholder="Network name (optional)"
                value={rpcName}
                onChange={(e) => setRpcName(e.target.value)}
              />
              <input
                className="wallet-select"
                type="url"
                placeholder="RPC URL (https://...)"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
              />
              <input
                className="wallet-select"
                type="url"
                placeholder="Explorer URL (optional)"
                value={explorerUrl}
                onChange={(e) => setExplorerUrl(e.target.value)}
              />
              <div className="wallet-actions">
                <button
                  type="button"
                  className="wallet-add"
                  onClick={submitRpc}
                  disabled={addingRpc || switching}
                >
                  {addingRpc ? 'Detecting chain…' : 'Detect & Add'}
                </button>
                <button
                  type="button"
                  className="wallet-cancel"
                  onClick={toggleAddRpc}
                  disabled={addingRpc}
                >
                  Cancel
                </button>
              </div>
              {addError && <span className="wallet-error">{addError}</span>}
            </div>
          ) : (
            <NetworkPicker
              networks={networks}
              chainId={chainId}
              disabled={switching}
              onSelect={(id) => switchNetwork(id)}
            />
          )}
          {switching && <p className="wallet-switching">Switching network…</p>}

          {!showAddRpc && (
            <button type="button" className="wallet-add-toggle" onClick={toggleAddRpc}>
              + Add network
            </button>
          )}

          {menuError && <span className="wallet-error">{menuError}</span>}

          <button type="button" className="wallet-disconnect" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
