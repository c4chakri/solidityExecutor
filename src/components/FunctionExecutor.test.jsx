import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FunctionExecutor from './FunctionExecutor';

const ABI = [
  {
    type: 'function',
    name: 'setPolicy',
    stateMutability: 'nonpayable',
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
    outputs: [],
  },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
];

function open(name) {
  render(<FunctionExecutor contractAddress="0xF3001f12221A3390CAE2daed751a4A3fC967f8C7" abi={ABI} />);
  fireEvent.click(screen.getByText(name));
}

test('Clear empties every field and the result for that function', () => {
  open('setPolicy');
  const token = screen.getByLabelText(/token/);
  const policy = screen.getByLabelText(/policy/);

  fireEvent.change(token, { target: { value: '0x0000000000000000000000000000000000000001' } });
  fireEvent.change(policy, { target: { value: '[true, 2]' } });
  expect(token).toHaveValue('0x0000000000000000000000000000000000000001');
  expect(policy).toHaveValue('[true, 2]');

  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(token).toHaveValue('');
  expect(policy).toHaveValue('');
});

test('Clear removes a shown result', async () => {
  open('setPolicy');
  fireEvent.change(screen.getByLabelText(/token/), {
    target: { value: '0x0000000000000000000000000000000000000001' },
  });
  fireEvent.change(screen.getByLabelText(/policy/), { target: { value: '[true, 2]' } });

  // Args parse, then the missing wallet is reported — no network call happens.
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText(/Wallet not connected/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByText(/Wallet not connected/)).not.toBeInTheDocument();
});

test('Clear removes an argument error', async () => {
  open('setPolicy');

  // Empty tuple field: the parser reports it before any network call.
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText(/value is required/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByText(/value is required/)).not.toBeInTheDocument();
});

test('Clear appears only once there is something to clear', () => {
  open('setPolicy');
  expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/policy/), { target: { value: '[true, 2]' } });
  expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
});

test('an untouched argument-less function shows no Clear', () => {
  open('paused');
  expect(screen.getByRole('button', { name: 'Call' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
});

test('Clear appears for an argument-less function once it has a result', async () => {
  open('paused');

  // No RPC configured, so Call reports that instead of hitting the network.
  fireEvent.click(screen.getByRole('button', { name: 'Call' }));
  expect(await screen.findByText(/Select a network first/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
});

test('each function clears independently', () => {
  render(<FunctionExecutor contractAddress="0xF3001f12221A3390CAE2daed751a4A3fC967f8C7" abi={ABI} />);
  fireEvent.click(screen.getByText('setPolicy'));
  fireEvent.click(screen.getByText('paused'));

  fireEvent.change(screen.getByLabelText(/policy/), { target: { value: '[true, 2]' } });

  // Only the dirty accordion offers Clear, and it clears only its own input.
  const clears = screen.getAllByRole('button', { name: 'Clear' });
  expect(clears).toHaveLength(1);

  fireEvent.click(clears[0]);
  expect(screen.getByLabelText(/policy/)).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
});

describe('the All / Read / Write filter', () => {
  const MIXED = [
    { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [] },
    { type: 'function', name: 'totalSupply', stateMutability: 'pure', inputs: [], outputs: [] },
    { type: 'function', name: 'pause', stateMutability: 'nonpayable', inputs: [], outputs: [] },
    { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
    // Pre-0.5 ABI: `constant` with no stateMutability.
    { type: 'function', name: 'legacyRead', constant: true, inputs: [], outputs: [] },
    { type: 'function', name: 'legacyWrite', constant: false, inputs: [], outputs: [] },
    { type: 'event', name: 'Paused', inputs: [] },
  ];

  let view;
  function mount() {
    view = render(
      <FunctionExecutor contractAddress="0xF3001f12221A3390CAE2daed751a4A3fC967f8C7" abi={MIXED} />
    );
  }
  const listed = () => view.container.querySelectorAll('.accordion-item:not([hidden])').length;

  test('sits Read · All · Write in that order, with All active', () => {
    mount();
    const group = screen.getByRole('group', { name: 'Filter functions' });
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Read',
      'All',
      'Write',
    ]);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('paused')).toBeVisible();
    expect(screen.getByText('deposit')).toBeVisible();
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
    expect(listed()).toBe(7); // 6 functions + Raw calldata
  });

  test('Read shows view, pure and legacy constant functions only', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    ['paused', 'totalSupply', 'legacyRead'].forEach((n) =>
      expect(screen.getByText(n)).toBeVisible()
    );
    ['pause', 'deposit', 'legacyWrite'].forEach((n) =>
      expect(screen.getByText(n)).not.toBeVisible()
    );
    // Raw calldata always writes, so Read hides it too.
    expect(screen.getByText('Raw calldata')).not.toBeVisible();
    expect(listed()).toBe(3);
  });

  test('Write shows nonpayable, payable and legacy non-constant functions only', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Write' }));

    ['pause', 'deposit', 'legacyWrite'].forEach((n) =>
      expect(screen.getByText(n)).toBeVisible()
    );
    ['paused', 'totalSupply', 'legacyRead'].forEach((n) =>
      expect(screen.getByText(n)).not.toBeVisible()
    );
    expect(screen.getByText('Raw calldata')).toBeVisible();
    expect(listed()).toBe(4); // 3 write functions + Raw calldata
  });

  test('switching filters keeps typed input and never moves it between functions', () => {
    render(
      <FunctionExecutor
        contractAddress="0xF3001f12221A3390CAE2daed751a4A3fC967f8C7"
        abi={[
          { type: 'function', name: 'read1', stateMutability: 'view', inputs: [{ name: 'a', type: 'uint256' }], outputs: [] },
          { type: 'function', name: 'write1', stateMutability: 'nonpayable', inputs: [{ name: 'b', type: 'uint256' }], outputs: [] },
        ]}
      />
    );

    fireEvent.click(screen.getByText('write1'));
    fireEvent.change(screen.getByLabelText(/b/), { target: { value: '99' } });

    // read1's own field stays empty — no state leaks across the filter switch.
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    fireEvent.click(screen.getByText('read1'));
    expect(screen.getByLabelText(/^a/)).toHaveValue('');

    // ...and write1's input survived being filtered out.
    fireEvent.click(screen.getByRole('button', { name: 'Write' }));
    expect(screen.getByLabelText(/^b/)).toHaveValue('99');
  });

  test('reports an empty filter result rather than showing a blank list', () => {
    render(
      <FunctionExecutor
        contractAddress="0xF3001f12221A3390CAE2daed751a4A3fC967f8C7"
        abi={[{ type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [] }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Write' }));
    expect(screen.getByText(/No write functions in this ABI/)).toBeInTheDocument();
    // Raw calldata stays offered — with no write functions it is the only way
    // to send anything.
    expect(screen.getByText('Raw calldata')).toBeVisible();
  });

  test('reports an ABI with no functions at all', () => {
    render(
      <FunctionExecutor
        contractAddress="0xF3001f12221A3390CAE2daed751a4A3fC967f8C7"
        abi={[{ type: 'event', name: 'Paused', inputs: [] }]}
      />
    );
    expect(screen.getByText(/declares no functions/)).toBeInTheDocument();
  });
});
