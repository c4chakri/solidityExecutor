import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NetworkPicker from './NetworkPicker';
import { mergeNetworks, appendRpc, toHexChainId } from '../lib/networks';

/** Builds `count` overlaid chains, bypassing the caps to stress the UI alone. */
function manyNetworks(count) {
  const overlays = {};
  for (let i = 1; i <= count; i++) {
    const id = toHexChainId(100000 + i);
    overlays[id] = { chainId: id, chainName: `Network ${i}`, rpcUrls: [`http://n${i}.local`] };
  }
  return mergeNetworks(overlays);
}

test('keeps the rendered list bounded no matter how many networks exist', () => {
  render(<NetworkPicker networks={manyNetworks(1000)} chainId="0x1" onSelect={() => {}} />);

  expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(50);
  expect(screen.getByText(/more — refine your search/i)).toBeInTheDocument();
});

test('search narrows by name and by chain ID', () => {
  render(<NetworkPicker networks={manyNetworks(1000)} chainId="0x1" onSelect={() => {}} />);
  const search = screen.getByLabelText('Search networks');

  fireEvent.change(search, { target: { value: 'Network 777' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(screen.getByText('Network 777')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: '100778' } });
  expect(screen.getByText('Network 778')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'nothing here' } });
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  expect(screen.getByText(/No network matches/i)).toBeInTheDocument();
});

test('the search box is always offered, even for the built-in list', () => {
  render(<NetworkPicker networks={mergeNetworks({})} chainId="0x1" onSelect={() => {}} />);
  expect(screen.getByLabelText('Search networks')).toBeInTheDocument();
  expect(screen.getAllByRole('option').length).toBe(5);
});

test('search works on the short list too', () => {
  render(<NetworkPicker networks={mergeNetworks({})} chainId="0x1" onSelect={() => {}} />);
  fireEvent.change(screen.getByLabelText('Search networks'), { target: { value: 'poly' } });

  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(screen.getByText('Polygon')).toBeInTheDocument();
});

test('selects a network on click but not the current one', () => {
  const onSelect = jest.fn();
  render(<NetworkPicker networks={mergeNetworks({})} chainId="0x1" onSelect={onSelect} />);

  fireEvent.click(screen.getByText('Sepolia'));
  expect(onSelect).toHaveBeenCalledWith('0xaa36a7');

  onSelect.mockClear();
  fireEvent.click(screen.getByText('Ethereum'));
  expect(onSelect).not.toHaveBeenCalled();
});

test('keyboard navigation selects the highlighted network', () => {
  const onSelect = jest.fn();
  render(<NetworkPicker networks={manyNetworks(1000)} chainId="0x1" onSelect={onSelect} />);
  const search = screen.getByLabelText('Search networks');

  fireEvent.change(search, { target: { value: 'Network 42' } });
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  fireEvent.keyDown(search, { key: 'Enter' });

  expect(onSelect).toHaveBeenCalledWith(toHexChainId(100042));
});

test('every row stays clickable while a switch is in flight', () => {
  const onSelect = jest.fn();
  render(<NetworkPicker networks={mergeNetworks({})} chainId="0x1" disabled onSelect={onSelect} />);

  fireEvent.click(screen.getByText('Polygon'));
  expect(onSelect).not.toHaveBeenCalled();
  screen.getAllByRole('option').forEach((row) => expect(row).toBeDisabled());
});

test('the active endpoint is the most recently added one', () => {
  const { overlays } = appendRpc({}, { chainId: '0xc73b', rpcUrl: 'https://besu-2.gov-cloud.ai' });
  const net = mergeNetworks(overlays)['0xc73b'];
  expect(net.rpcUrls).toEqual(['https://besu-rpc.gov-cloud.ai', 'https://besu-2.gov-cloud.ai']);
});
