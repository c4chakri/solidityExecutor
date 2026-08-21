import React from 'react';
import { render, screen } from '@testing-library/react';
import VerifyTx from './VerifyTx';

// Only the receipt table is under test here; the lookup itself needs a node.
// Rendering with no details keeps this to the linking rules.
test('renders without an explorer configured', () => {
  render(<VerifyTx providerUrl={null} networkName="Sepolia" explorerUrl={null} />);
  expect(screen.getByRole('button', { name: 'Verify Transaction' })).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('only linkable fields become links, never every row', () => {
  // Exercises the same rule the table applies, without needing a live node:
  // a field with no explorer path must produce no link.
  const { buildExplorerUrl } = require('../lib/networks');
  const PATHS = { hash: 'tx', from: 'address', to: 'address', contractCreated: 'address' };
  const base = 'https://sepolia.etherscan.io';

  expect(buildExplorerUrl(base, PATHS.hash, '0xabc')).toBe(`${base}/tx/0xabc`);
  expect(buildExplorerUrl(base, PATHS.from, '0xdef')).toBe(`${base}/address/0xdef`);
  // blockNumber, value, gasUsed, timestamp … have no path and must not link
  ['blockNumber', 'value', 'gasUsed', 'timestamp', 'nonce'].forEach((field) => {
    expect(buildExplorerUrl(base, PATHS[field], '123')).toBeNull();
  });
});
