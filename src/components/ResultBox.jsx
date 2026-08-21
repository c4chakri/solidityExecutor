import React from 'react';
import { buildExplorerUrl } from '../lib/networks';

/**
 * The JSON result panel, with the transaction hash turned into an explorer
 * link when the chain has an explorer configured. The hash is linked in place
 * rather than added as a separate row, so the output stays one readable object.
 */
export default function ResultBox({ result, explorerUrl }) {
  const json = JSON.stringify(result, null, 2);
  const hash = typeof result?.txHash === 'string' ? result.txHash : null;
  const href = buildExplorerUrl(explorerUrl, 'tx', hash);

  if (!href) return <pre className="result-box">{json}</pre>;

  // Split on the hash and stitch a link back in at each occurrence.
  const parts = json.split(hash);
  return (
    <pre className="result-box">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <a href={href} target="_blank" rel="noreferrer" title="View on block explorer">
              {hash}
            </a>
          )}
        </React.Fragment>
      ))}
    </pre>
  );
}
