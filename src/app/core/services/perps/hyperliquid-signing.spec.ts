import { ethers } from 'ethers';

import {
  hyperliquidActionHash,
  signHyperliquidL1Action,
  signHyperliquidWithdraw,
} from './hyperliquid-signing';

const PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS = new ethers.Wallet(PRIVATE_KEY).address;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe('Hyperliquid signing', () => {
  const order = {
    type: 'order',
    orders: [
      {
        a: 0,
        b: true,
        p: '100',
        s: '0.1',
        r: false,
        t: { limit: { tif: 'Gtc' } },
      },
    ],
    grouping: 'na',
  };

  it('keeps the msgpack L1 action hash stable', () => {
    expect(hyperliquidActionHash(order, 1710000000123)).toBe(
      '0xae5b14333d155da3b4c3c2e635e113f5348ed446be84802fab44dfcc05899791'
    );
  });

  it('signs an L1 action as the wallet agent', async () => {
    const nonce = 1710000000123;
    const signature = await signHyperliquidL1Action(
      PRIVATE_KEY,
      order,
      nonce,
      false
    );
    const recovered = ethers.verifyTypedData(
      {
        name: 'Exchange',
        version: '1',
        chainId: 1337,
        verifyingContract: ZERO_ADDRESS,
      },
      {
        Agent: [
          { name: 'source', type: 'string' },
          { name: 'connectionId', type: 'bytes32' },
        ],
      },
      {
        source: 'b',
        connectionId: hyperliquidActionHash(order, nonce),
      },
      signature
    );

    expect(recovered).toBe(ADDRESS);
  });

  it('builds and signs the user withdrawal payload', async () => {
    const nonce = 1710000000123;
    const { action, signature } = await signHyperliquidWithdraw(
      PRIVATE_KEY,
      ADDRESS,
      '12.3',
      nonce,
      true
    );
    const recovered = ethers.verifyTypedData(
      {
        name: 'HyperliquidSignTransaction',
        version: '1',
        chainId: 421614,
        verifyingContract: ZERO_ADDRESS,
      },
      {
        'HyperliquidTransaction:Withdraw': [
          { name: 'hyperliquidChain', type: 'string' },
          { name: 'destination', type: 'string' },
          { name: 'amount', type: 'string' },
          { name: 'time', type: 'uint64' },
        ],
      },
      action,
      signature
    );

    expect(action.signatureChainId).toBe('0x66eee');
    expect(action.hyperliquidChain).toBe('Mainnet');
    expect(recovered).toBe(ADDRESS);
  });
});
