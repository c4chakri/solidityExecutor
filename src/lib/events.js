import { ethers } from 'ethers';
import { namedArgs, toPlain } from './abiValues';

/**
 * Decodes the logs on a transaction receipt against the contract ABI.
 *
 * A receipt carries every log the transaction produced, including ones from
 * other contracts it called. Those cannot be decoded with this ABI, so they are
 * reported by address and topic rather than dropped — a missing log is far more
 * confusing than an undecoded one.
 */
export function decodeLogs(abi, logs) {
  if (!logs || logs.length === 0) return [];

  let iface = null;
  try {
    iface = new ethers.Interface(abi);
  } catch {
    iface = null; // Malformed ABI: still report the raw logs below.
  }

  return logs.map((log) => {
    const base = {
      logIndex: log.index ?? log.logIndex ?? null,
      address: log.address,
    };

    const parsed = iface ? parseSafely(iface, log) : null;
    if (parsed) {
      return {
        ...base,
        event: parsed.name,
        signature: parsed.signature,
        args: namedArgs(parsed.fragment, parsed.args),
      };
    }

    return {
      ...base,
      event: null,
      note: 'not declared in this ABI — emitted by another contract in this call',
      topics: toPlain(log.topics ? [...log.topics] : []),
      data: log.data,
    };
  });
}

function parseSafely(iface, log) {
  try {
    return iface.parseLog({ topics: [...(log.topics || [])], data: log.data });
  } catch {
    return null;
  }
}
