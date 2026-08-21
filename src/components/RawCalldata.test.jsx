import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ethers } from 'ethers';
import RawCalldata from './RawCalldata';

const ABI = [
  {
    type: 'function',
    name: 'setPolicy',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      { name: 'token', type: 'address' },
      {
        name: 'policy',
        type: 'tuple',
        components: [
          { name: 'active', type: 'bool' },
          { name: 'tier', type: 'uint8' },
        ],
      },
    ],
  },
  { type: 'event', name: 'Paused', inputs: [] },
];
const CONTRACT = '0xF3001f12221A3390CAE2daed751a4A3fC967f8C7';
const CALLDATA = new ethers.Interface(ABI).encodeFunctionData('setPolicy', [
  '0x0000000000000000000000000000000000000001',
  [true, 2],
]);

function open(signer, explorerUrl) {
  render(
    <RawCalldata contractAddress={CONTRACT} abi={ABI} signer={signer} explorerUrl={explorerUrl} />
  );
  fireEvent.click(screen.getByText('Raw calldata'));
  return screen.getByLabelText(/calldata/);
}

test('previews what the pasted calldata decodes to', () => {
  const field = open(null);
  fireEvent.change(field, { target: { value: CALLDATA } });

  expect(screen.getByText(/setPolicy\(/)).toBeInTheDocument();
  expect(screen.getByText(/tier/)).toBeInTheDocument();
});

test('flags calldata the ABI does not know rather than blocking it', () => {
  const field = open(null);
  fireEvent.change(field, { target: { value: '0xdeadbeef' } });

  expect(screen.getByText(/not in this ABI/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
});

test('reports malformed hex instead of sending it', async () => {
  const send = jest.fn();
  const field = open({ sendTransaction: send });

  fireEvent.change(field, { target: { value: '0x374cf5e' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText(/even number of hex digits/)).toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
});

test('sends the exact bytes to the contract and shows decoded events', async () => {
  const receipt = {
    blockNumber: 42,
    gasUsed: 21000n,
    logs: [
      {
        address: CONTRACT,
        index: 0,
        ...new ethers.Interface(ABI).encodeEventLog('Paused', []),
      },
    ],
  };
  const sendTransaction = jest.fn().mockResolvedValue({
    hash: '0xabc',
    wait: () => Promise.resolve(receipt),
  });

  // Pasted with stray whitespace and no 0x, as it often arrives.
  const field = open({ sendTransaction });
  fireEvent.change(field, { target: { value: ` ${CALLDATA.slice(2)}\n` } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText(/Transaction successful/)).toBeInTheDocument();
  expect(sendTransaction).toHaveBeenCalledWith({ to: CONTRACT, data: CALLDATA });

  const shown = screen.getByText(/Transaction successful/).textContent;
  expect(shown).toContain('"gasUsed": "21000"');
  expect(shown).toContain('"event": "Paused"');
});

test('requires a wallet before sending', async () => {
  const field = open(null);
  fireEvent.change(field, { target: { value: CALLDATA } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText(/Wallet not connected/)).toBeInTheDocument();
});

test('Clear appears only once there is calldata, and empties it', () => {
  const field = open(null);
  expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

  fireEvent.change(field, { target: { value: CALLDATA } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

  expect(field).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
});

test('the tx hash in a real send links to the configured explorer', async () => {
  const hash = '0xf4b3334810749b3d1b4b770df8323890fcab7c2b6b8af5a28e231d4161d7fbb6';
  const sendTransaction = jest.fn().mockResolvedValue({
    hash,
    wait: () => Promise.resolve({ blockNumber: 7, gasUsed: 21000n, logs: [] }),
  });

  const field = open({ sendTransaction }, 'https://sepolia.etherscan.io');
  fireEvent.change(field, { target: { value: CALLDATA } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  const link = await screen.findByRole('link', { name: hash });
  expect(link).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${hash}`);
});
