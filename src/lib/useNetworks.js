import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  activeRpcUrl,
  appendRpc,
  detectChainId,
  loadOverlays,
  mergeNetworks,
  normalizeExplorerUrl,
  normalizeRpcUrl,
  saveOverlays,
  touchNetwork,
} from './networks';

/**
 * Owns the network list: built-in presets merged with user-added endpoints.
 * Bounded and persisted — see the notes in ./networks.
 */
export function useNetworks() {
  const [overlays, setOverlays] = useState(loadOverlays);

  const networks = useMemo(() => mergeNetworks(overlays), [overlays]);

  useEffect(() => {
    saveOverlays(overlays);
  }, [overlays]);

  /** The RPC to read through for `chainId`. */
  const rpcUrlFor = useCallback(
    (chainId) => (chainId ? activeRpcUrl(networks[chainId]) : null),
    [networks]
  );

  /**
   * Validates the inputs, asks the node for its chain ID, then appends the URL
   * to that chain's endpoints — creating the network if it is new — and makes it
   * the active one.
   *
   * Returns { chainId, chainName, network, isNewNetwork }.
   */
  const addRpc = useCallback(
    async ({ rpcUrl, chainName, explorerUrl }) => {
      const url = normalizeRpcUrl(rpcUrl);
      const explorer = normalizeExplorerUrl(explorerUrl);
      const chainId = await detectChainId(url);

      const result = appendRpc(overlays, {
        chainId,
        rpcUrl: url,
        chainName: (chainName || '').trim() || undefined,
        explorerUrl: explorer,
      });
      const nextNetworks = mergeNetworks(result.overlays);

      setOverlays(result.overlays);

      return {
        chainId,
        chainName: nextNetworks[chainId].chainName,
        network: nextNetworks[chainId],
        isNewNetwork: !networks[chainId],
      };
    },
    [overlays, networks]
  );

  /** Keeps a network the user actually uses from being evicted. */
  const touch = useCallback((chainId) => {
    setOverlays((prev) => touchNetwork(prev, chainId));
  }, []);

  return { networks, rpcUrlFor, addRpc, touch };
}
