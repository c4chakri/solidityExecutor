import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ContractForm from './ContractForm';

const ADDRESS = '0xF3001f12221A3390CAE2daed751a4A3fC967f8C7';
const ABI = [
  {
    type: 'function',
    name: 'setPolicy',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },
  { type: 'error', name: 'Nope', inputs: [] },
];

test('a loaded ABI sits on one line in an editable field', () => {
  render(<ContractForm onLoad={() => {}} saved={{ contractAddress: ADDRESS, abi: ABI }} />);

  const field = screen.getByLabelText('ABI');
  expect(field.value.startsWith('[{ "type": "function", "name": "setPolicy"')).toBe(true);
  // One line, not the pretty-printed dump — and the whole ABI, not a snippet.
  expect(field.value).not.toContain('\n');
  expect(field.value).toContain('"Nope"');
  expect(field).not.toHaveAttribute('readonly');
  expect(field).toHaveAttribute('wrap', 'off');
});

test('the loaded ABI can be edited in place', () => {
  const onLoad = jest.fn();
  render(<ContractForm onLoad={onLoad} saved={{ contractAddress: ADDRESS, abi: ABI }} />);

  const field = screen.getByLabelText('ABI');
  fireEvent.change(field, { target: { value: 'function paused() view returns (bool)' } });
  expect(field).toHaveValue('function paused() view returns (bool)');

  fireEvent.click(screen.getByRole('button', { name: 'Load Contract' }));
  expect(onLoad).toHaveBeenCalledTimes(1);
  expect(onLoad.mock.calls[0][0].abi.map((f) => f.name)).toEqual(['paused']);
});

test('the copy button carries the full ABI, not the preview', () => {
  render(<ContractForm onLoad={() => {}} saved={{ contractAddress: ADDRESS, abi: ABI }} />);

  // Two copy buttons: address and ABI.
  expect(screen.getByLabelText('Copy address')).toBeInTheDocument();
  expect(screen.getByLabelText('Copy ABI')).toBeInTheDocument();
});

test('there is no Edit button — the field is always the field', () => {
  render(<ContractForm onLoad={() => {}} saved={{ contractAddress: ADDRESS, abi: ABI }} />);
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
});

test('nothing loaded means the paste field, no preview', () => {
  render(<ContractForm onLoad={() => {}} saved={null} />);
  expect(screen.queryByTitle('Loaded ABI')).not.toBeInTheDocument();
  expect(screen.getByLabelText('ABI')).toHaveValue('');
});

test('loading a pasted ABI collapses it and reports it upward', () => {
  const onLoad = jest.fn();
  render(<ContractForm onLoad={onLoad} saved={null} />);

  fireEvent.change(screen.getByLabelText('Contract address'), { target: { value: ADDRESS } });
  fireEvent.change(screen.getByLabelText('ABI'), {
    target: { value: 'function setPolicy(address token)\nerror Nope()' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load Contract' }));

  expect(onLoad).toHaveBeenCalledTimes(1);
  const passed = onLoad.mock.calls[0][0];
  expect(passed.contractAddress).toBe(ADDRESS);
  expect(passed.abi.map((f) => f.type)).toEqual(['function', 'error']);
  // Deprecated duplicates of stateMutability are not carried through.
  expect(passed.abi[0]).not.toHaveProperty('constant');
  expect(passed.abi[0]).not.toHaveProperty('payable');
});

test('an invalid address is reported and nothing is loaded', () => {
  const onLoad = jest.fn();
  render(<ContractForm onLoad={onLoad} saved={null} />);

  fireEvent.change(screen.getByLabelText('Contract address'), { target: { value: '0xF3001f12' } });
  fireEvent.change(screen.getByLabelText('ABI'), { target: { value: '[]' } });
  fireEvent.click(screen.getByRole('button', { name: 'Load Contract' }));

  expect(screen.getByText(/40 hex digits after 0x — this has 8/)).toBeInTheDocument();
  expect(onLoad).not.toHaveBeenCalled();
});

test('an ABI with no error types loads but warns', () => {
  render(<ContractForm onLoad={() => {}} saved={null} />);

  fireEvent.change(screen.getByLabelText('Contract address'), { target: { value: ADDRESS } });
  fireEvent.change(screen.getByLabelText('ABI'), {
    target: { value: 'function setPolicy(address token)' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load Contract' }));

  expect(screen.getByText(/No error types in this ABI/)).toBeInTheDocument();
});
