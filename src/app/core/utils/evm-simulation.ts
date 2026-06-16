import { ethers } from 'ethers';

export type EvmBalanceChangeAssetType =
  | 'native'
  | 'ERC-20'
  | 'ERC-721'
  | 'ERC-1155';

export interface EvmEstimatedBalanceChange {
  address: string;
  direction: 'in' | 'out';
  assetType: EvmBalanceChangeAssetType;
  amount: string;
  symbol?: string;
  tokenId?: string;
}

/**
 * Pseudo address used by Geth's `eth_simulateV1` `traceTransfers` option to
 * report native value movements as ERC-20-style Transfer logs.
 */
export const NATIVE_TRANSFER_LOG_ADDRESS =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

/** keccak256("Transfer(address,address,uint256)") — ERC-20 / ERC-721 */
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/** keccak256("TransferSingle(address,address,address,uint256,uint256)") */
const TRANSFER_SINGLE_TOPIC =
  '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
/** keccak256("TransferBatch(address,address,address,uint256[],uint256[])") */
const TRANSFER_BATCH_TOPIC =
  '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb';

const NATIVE_CONTRACT_KEY = 'native';
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

/**
 * Balance injected into the sender's account when simulating, so the node can
 * dry-run the call even when the real account can't cover the value + gas.
 * Without this, swaps from an unfunded/low-balance account fail with
 * `insufficient funds` (-38014) and the simulation reports nothing instead of
 * the contract's real revert reason — matching MetaMask's behaviour. ~79 billion
 * ETH (2^96 wei), comfortably above any value + gas the call could require.
 */
const SIMULATION_SENDER_BALANCE = '0x1000000000000000000000000';

export interface SimulationLog {
  address: string;
  topics: string[];
  data: string;
}

export type SimulationStatus =
  | 'loading'
  | 'success'
  | 'reverted'
  | 'unavailable';

/**
 * The outcome of dry-running a transaction, used to drive the confirm UI:
 * - `success` — executed; `changes` holds the net asset movements (may be empty)
 * - `reverted` — the transaction would fail; `revertReason` holds the message
 * - `unavailable` — the simulation itself could not run (RPC/node error)
 * - `loading` — initial state while the simulation is in flight
 */
export interface SimulationResult {
  status: SimulationStatus;
  changes: EvmEstimatedBalanceChange[];
  revertReason?: string;
}

export interface SimulationCallOutcome {
  reverted: boolean;
  revertReason?: string;
  logs: SimulationLog[];
}

/**
 * Pull the single executed call out of an `eth_simulateV1` response,
 * reporting whether it reverted and collecting its logs. Returns `null` when
 * the response shape is unusable (treated as "unavailable" by callers).
 */
export function extractSimulationCall(
  result: any
): SimulationCallOutcome | null {
  if (!Array.isArray(result) || !result.length) {
    return null;
  }
  const calls = result[0]?.calls;
  if (!Array.isArray(calls) || !calls.length) {
    return null;
  }
  const logs: SimulationLog[] = [];
  calls.forEach((call) => {
    (call?.logs || []).forEach((log: SimulationLog) => logs.push(log));
  });
  const primary = calls[0];
  const reverted = primary?.status === '0x0';
  return {
    reverted,
    revertReason: reverted ? parseRevertReason(primary?.error) : undefined,
    logs,
  };
}

/**
 * Extract a human-readable revert reason from a simulated call's error.
 * Geth already decodes `Error(string)` reverts into `error.message`
 * (e.g. "execution reverted: 03Aggregator: EXPIRED"); we strip the prefix
 * and fall back to decoding `error.data` for safety.
 */
export function parseRevertReason(error: any): string | undefined {
  if (!error) {
    return undefined;
  }
  const message = typeof error.message === 'string' ? error.message : '';
  const stripped = message
    .replace(/^execution reverted:?\s*/i, '')
    // Geth sometimes appends the raw return data (e.g. "...: 0x08c379a0…");
    // drop it so we show just the decoded reason, like MetaMask.
    .replace(/:?\s*0x[0-9a-fA-F]+\s*$/, '')
    .trim();
  if (stripped) {
    return stripped;
  }
  const data = typeof error.data === 'string' ? error.data : '';
  // Error(string): selector 0x08c379a0 followed by an ABI-encoded string.
  if (data.startsWith('0x08c379a0') && data.length > 10) {
    try {
      const [reason] = abiCoder.decode(['string'], '0x' + data.slice(10));
      if (reason) {
        return reason as string;
      }
    } catch {
      // fall through
    }
  }
  return undefined;
}

/**
 * A net balance change for a single asset, produced by simulating a
 * transaction. Amounts are still in base units (wei / token integer units);
 * the caller is responsible for formatting with the token's decimals.
 */
export interface RawSimulatedBalanceChange {
  assetType: EvmBalanceChangeAssetType;
  /** Token contract address, or `'native'` for the chain's base asset. */
  contractAddress: string;
  direction: 'in' | 'out';
  /** Absolute amount in base units (integer string). */
  rawAmount: string;
  tokenId?: string;
}

/**
 * Build the params for an `eth_simulateV1` call that executes a single
 * transaction against the latest block and traces native transfers.
 */
export function buildSimulationParams(tx: {
  from: string;
  to?: string;
  value?: string;
  data?: string;
}): [object, string] {
  const call: Record<string, string> = { from: tx.from };
  if (tx.to) {
    call.to = tx.to;
  }
  if (tx.data && tx.data !== '0x') {
    call.data = tx.data;
  }
  call.value = toHexQuantity(tx.value);
  return [
    {
      blockStateCalls: [
        {
          calls: [call],
          // Fund the sender so the node can execute the call regardless of the
          // account's real balance; we only care about the resulting transfers
          // and revert reason, not whether the account can actually pay.
          stateOverrides: {
            [tx.from]: { balance: SIMULATION_SENDER_BALANCE },
          },
        },
      ],
      traceTransfers: true,
      validation: false,
      returnFullTransactions: false,
    },
    'latest',
  ];
}

/**
 * Parse the logs emitted by a simulated transaction into the net balance
 * changes that affect `userAddress`. In/out movements of the same asset are
 * netted, so a swap surfaces as one outgoing and one incoming asset.
 */
export function parseSimulatedBalanceChanges(
  logs: SimulationLog[],
  userAddress: string
): RawSimulatedBalanceChange[] {
  if (!Array.isArray(logs) || !userAddress) {
    return [];
  }
  const user = userAddress.toLowerCase();

  // key -> { meta, net }
  const nets = new Map<
    string,
    {
      assetType: EvmBalanceChangeAssetType;
      contractAddress: string;
      tokenId?: string;
      net: bigint;
    }
  >();

  const applyTransfer = (
    from: string,
    to: string,
    amount: bigint,
    assetType: EvmBalanceChangeAssetType,
    contractAddress: string,
    tokenId?: string
  ) => {
    const fromIsUser = from.toLowerCase() === user;
    const toIsUser = to.toLowerCase() === user;
    if (!fromIsUser && !toIsUser) {
      return;
    }
    const key = `${assetType}:${contractAddress.toLowerCase()}:${
      tokenId ?? ''
    }`;
    const entry =
      nets.get(key) ??
      { assetType, contractAddress, tokenId, net: BigInt(0) };
    if (fromIsUser) {
      entry.net -= amount;
    }
    if (toIsUser) {
      entry.net += amount;
    }
    nets.set(key, entry);
  };

  for (const log of logs) {
    const topic0 = log?.topics?.[0]?.toLowerCase();
    try {
      if (topic0 === TRANSFER_TOPIC) {
        const from = addressFromTopic(log.topics[1]);
        const to = addressFromTopic(log.topics[2]);
        const isNative =
          log.address?.toLowerCase() === NATIVE_TRANSFER_LOG_ADDRESS;
        if (log.topics.length === 4) {
          // ERC-721: from, to, tokenId all indexed.
          applyTransfer(
            from,
            to,
            BigInt(1),
            'ERC-721',
            log.address,
            BigInt(log.topics[3]).toString()
          );
        } else {
          // ERC-20 (or native): value in data.
          applyTransfer(
            from,
            to,
            BigInt(log.data || '0x0'),
            isNative ? 'native' : 'ERC-20',
            isNative ? NATIVE_CONTRACT_KEY : log.address
          );
        }
      } else if (topic0 === TRANSFER_SINGLE_TOPIC) {
        // operator (topics[1]) ignored; from, to indexed.
        const from = addressFromTopic(log.topics[2]);
        const to = addressFromTopic(log.topics[3]);
        const [id, value] = abiCoder.decode(
          ['uint256', 'uint256'],
          log.data
        );
        applyTransfer(
          from,
          to,
          BigInt(value.toString()),
          'ERC-1155',
          log.address,
          id.toString()
        );
      } else if (topic0 === TRANSFER_BATCH_TOPIC) {
        const from = addressFromTopic(log.topics[2]);
        const to = addressFromTopic(log.topics[3]);
        const [ids, values] = abiCoder.decode(
          ['uint256[]', 'uint256[]'],
          log.data
        );
        ids.forEach((id: bigint, index: number) => {
          applyTransfer(
            from,
            to,
            BigInt(values[index].toString()),
            'ERC-1155',
            log.address,
            id.toString()
          );
        });
      }
    } catch {
      // Skip malformed logs rather than failing the whole simulation.
      continue;
    }
  }

  const changes: RawSimulatedBalanceChange[] = [];
  nets.forEach(({ assetType, contractAddress, tokenId, net }) => {
    if (net === BigInt(0)) {
      return;
    }
    changes.push({
      assetType,
      contractAddress,
      direction: net > BigInt(0) ? 'in' : 'out',
      rawAmount: (net < BigInt(0) ? -net : net).toString(),
      tokenId,
    });
  });
  return changes;
}

export function isNativeContract(contractAddress: string): boolean {
  return contractAddress === NATIVE_CONTRACT_KEY;
}

function addressFromTopic(topic: string): string {
  // A topic is a 32-byte word; an address occupies the low 20 bytes.
  return ethers.getAddress('0x' + topic.slice(-40));
}

function toHexQuantity(value?: string): string {
  if (!value) {
    return '0x0';
  }
  try {
    // Accept both decimal and 0x-prefixed inputs.
    return '0x' + BigInt(value).toString(16);
  } catch {
    return '0x0';
  }
}
