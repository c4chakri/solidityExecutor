import React from 'react';
import { render, screen } from '@testing-library/react';
import ResultBox from './ResultBox';

const HASH = '0xf4b3334810749b3d1b4b770df8323890fcab7c2b6b8af5a28e231d4161d7fbb6';
const RESULT = {
  message: 'Transaction successful!',
  txHash: HASH,
  blockNumber: 42,
  gasUsed: '21000',
  events: [{ event: 'PolicySet', args: { tier: '2' } }],
};

test('the tx hash becomes an explorer link', () => {
  render(<ResultBox result={RESULT} explorerUrl="https://sepolia.etherscan.io" />);

  const link = screen.getByRole('link', { name: HASH });
  expect(link).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${HASH}`);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
});

test('a trailing slash on the explorer URL does not double up', () => {
  render(<ResultBox result={RESULT} explorerUrl="https://sepolia.etherscan.io/" />);
  expect(screen.getByRole('link', { name: HASH })).toHaveAttribute(
    'href',
    `https://sepolia.etherscan.io/tx/${HASH}`
  );
});

test('the rest of the result is untouched', () => {
  const { container } = render(
    <ResultBox result={RESULT} explorerUrl="https://sepolia.etherscan.io" />
  );
  const text = container.querySelector('.result-box').textContent;
  expect(JSON.parse(text)).toEqual(RESULT);
});

test('no explorer configured leaves plain text', () => {
  render(<ResultBox result={RESULT} explorerUrl={null} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText(/Transaction successful/)).toBeInTheDocument();
});

test('a result with no tx hash renders plainly', () => {
  render(
    <ResultBox
      result={{ error: 'Reverted: Nope()' }}
      explorerUrl="https://sepolia.etherscan.io"
    />
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText(/Reverted: Nope/)).toBeInTheDocument();
});

test('a read result (a bare value) renders plainly', () => {
  render(<ResultBox result={'true'} explorerUrl="https://sepolia.etherscan.io" />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
