import React, { useState } from 'react';
import { ethers } from 'ethers';

export default function VerifyTx({ providerUrl, networkName }) {
  const [txHash, setTxHash] = useState('');
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    setError(null);
    setDetails(null);

    // Network comes from the navbar wallet selection
    if (!providerUrl) {
      setError('Select a network from the top-right wallet menu first.');
      return;
    }

    // Validate tx hash
    if (!/^0x([A-Fa-f0-9]{64})$/.test(txHash.trim())) {
      setError('Please enter a valid transaction hash (0x + 64 hex characters)');
      return;
    }

    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(providerUrl);
      const hash = txHash.trim();

      const tx = await provider.getTransaction(hash);
      if (!tx) {
        setError('Transaction not found on this network. Check the hash and RPC URL.');
        setLoading(false);
        return;
      }

      const receipt = await provider.getTransactionReceipt(hash);

      // Try to resolve the block timestamp (if mined)
      let timestamp = null;
      if (tx.blockNumber != null) {
        const block = await provider.getBlock(tx.blockNumber);
        if (block) timestamp = block.timestamp;
      }

      const net = await provider.getNetwork();

      const status =
        receipt == null
          ? 'Pending'
          : receipt.status === 1
          ? 'Success'
          : 'Failed';

      const gasUsed = receipt?.gasUsed ?? null;
      const effectiveGasPrice = receipt?.gasPrice ?? tx.gasPrice ?? null;
      const feeWei =
        gasUsed != null && effectiveGasPrice != null
          ? gasUsed * effectiveGasPrice
          : null;

      setDetails({
        status,
        hash: tx.hash,
        network: `${net.name} (chainId ${net.chainId.toString()})`,
        blockNumber: tx.blockNumber,
        timestamp: timestamp
          ? new Date(timestamp * 1000).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              dateStyle: 'medium',
              timeStyle: 'medium',
            }) + ' IST'
          : 'Pending',
        confirmations:
          tx.blockNumber != null
            ? (await provider.getBlockNumber()) - tx.blockNumber + 1
            : 0,
        from: tx.from,
        to: tx.to ?? '(contract creation)',
        contractCreated: receipt?.contractAddress ?? null,
        value: `${ethers.formatEther(tx.value)} ETH`,
        nonce: tx.nonce,
        gasLimit: tx.gasLimit?.toString() ?? null,
        gasUsed: gasUsed?.toString() ?? null,
        gasPrice: effectiveGasPrice
          ? `${ethers.formatUnits(effectiveGasPrice, 'gwei')} Gwei`
          : null,
        transactionFee:
          feeWei != null ? `${ethers.formatEther(feeWei)} ETH` : null,
        data: tx.data && tx.data !== '0x' ? tx.data : '(none)',
      });
    } catch (err) {
      console.error('Verify tx error:', err);
      setError(err.message || 'Failed to fetch transaction details');
    } finally {
      setLoading(false);
    }
  };

  const statusColor =
    details?.status === 'Success'
      ? '#22c55e'
      : details?.status === 'Failed'
      ? '#ef4444'
      : '#eab308';

  return (
    <div className="space-y-4">
      <h3>Verify Transaction</h3>

      <p className="network-hint">
        Network:{' '}
        <strong>{networkName || 'none selected (use the top-right wallet menu)'}</strong>
      </p>

      <input
        type="text"
        placeholder="Transaction Hash (0x...)"
        value={txHash}
        onChange={e => setTxHash(e.target.value)}
      />

      <button onClick={verify} disabled={loading}>
        {loading ? 'Fetching...' : 'Verify Transaction'}
      </button>

      {error && (
        <pre className="result-box" style={{ color: '#ef4444' }}>
          {error}
        </pre>
      )}

      {details && (
        <div className="function-block">
          <div style={{ marginBottom: '12px' }}>
            <strong>Status: </strong>
            <span style={{ color: statusColor, fontWeight: 600 }}>
              {details.status}
            </span>
          </div>
          <table className="tx-table">
            <tbody>
              {Object.entries(details)
                .filter(([key]) => key !== 'status')
                .filter(([, value]) => value !== null)
                .map(([key, value]) => (
                  <tr key={key}>
                    <td className="tx-key">{labels[key] || key}</td>
                    <td className="tx-val">{String(value)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const labels = {
  hash: 'Tx Hash',
  network: 'Network',
  blockNumber: 'Block',
  timestamp: 'Timestamp',
  confirmations: 'Confirmations',
  from: 'From',
  to: 'To',
  contractCreated: 'Contract Created',
  value: 'Value',
  nonce: 'Nonce',
  gasLimit: 'Gas Limit',
  gasUsed: 'Gas Used',
  gasPrice: 'Gas Price',
  transactionFee: 'Transaction Fee',
  data: 'Input Data',
};
