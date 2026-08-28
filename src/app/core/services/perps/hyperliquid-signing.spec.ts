import { ethers } from 'ethers';

import {
  hyperliquidActionHash,
  signHyperliquidL1Action,
  signHyperliquidSendToEvmWithData,
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

  it('encodes an order id above 2^53 as the standard msgpack uint64', () => {
    const oid = 18446744073709551615n;
    expect(
      hyperliquidActionHash(
        { type: 'cancel', cancels: [{ a: 0, o: oid }] },
        1710000000123
      )
    ).toBe(
      '0x37c8177a5be217ee61571a108963956e924026cb181bbdd390f7681f49734f2d'
    );
  });

  /**
   * msgpack 整数必须采用最窄的格式，否则交易场所（它会在校验签名前重新编码 action）
   * 会算出不同的哈希，并恢复出不同的签名者。普通 number 本来就走库的最小编码器，
   * 所以同值的 bigint 必须哈希出完全相同的结果。
   */
  it('hashes a representable order id the same as a plain number', () => {
    const nonce = 1710000000123;
    [0, 42, 77738308, 4294967295, 4294967296, 34567890123].forEach((oid) => {
      expect(
        hyperliquidActionHash(
          { type: 'cancel', cancels: [{ a: 0, o: BigInt(oid) }] },
          nonce
        )
      ).toBe(
        hyperliquidActionHash(
          { type: 'cancel', cancels: [{ a: 0, o: oid }] },
          nonce
        )
      );
    });
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
    const { action, signature } = await signHyperliquidSendToEvmWithData(
      PRIVATE_KEY,
      ADDRESS,
      '12.3',
      3,
      nonce,
      true,
      ''
    );
    const recovered = ethers.verifyTypedData(
      {
        name: 'HyperliquidSignTransaction',
        version: '1',
        chainId: 421614,
        verifyingContract: ZERO_ADDRESS,
      },
      {
        'HyperliquidTransaction:SendToEvmWithData': [
          { name: 'hyperliquidChain', type: 'string' },
          { name: 'token', type: 'string' },
          { name: 'amount', type: 'string' },
          { name: 'sourceDex', type: 'string' },
          { name: 'destinationRecipient', type: 'string' },
          { name: 'addressEncoding', type: 'string' },
          { name: 'destinationChainId', type: 'uint32' },
          { name: 'gasLimit', type: 'uint64' },
          { name: 'data', type: 'bytes' },
          { name: 'nonce', type: 'uint64' },
        ],
      },
      action,
      signature
    );

    expect(action.signatureChainId).toBe('0x66eee');
    expect(action.hyperliquidChain).toBe('Mainnet');
    expect(recovered).toBe(ADDRESS);
  });

  it('debits the balance the caller named and lets the forwarder deliver it', async () => {
    const { action } = await signHyperliquidSendToEvmWithData(
      PRIVATE_KEY,
      ADDRESS,
      '12.3',
      3,
      1710000000123,
      true,
      ''
    );

    // 换成我们自己的 hook data 会丢掉转发费，让这条消息
    // 留给目的链上第一个来认领的人。
    expect(action.sourceDex).toBe('');
    expect(action.data).toBe('0x');
    expect(action.token).toBe('USDC');
    expect(action.addressEncoding).toBe('hex');
    expect(action.destinationRecipient).toBe(ADDRESS.toLowerCase());
  });

  it('debits spot when that is where the account keeps its USDC', async () => {
    // 统一账户的永续余额无论有多少资金都报 0，
    // 所以从永续侧发起的提现等于提了个寂寞。
    const { action } = await signHyperliquidSendToEvmWithData(
      PRIVATE_KEY,
      ADDRESS,
      '12.3',
      3,
      1710000000123,
      true,
      'spot'
    );

    expect(action.sourceDex).toBe('spot');
  });

  it('signs the empty hook data as bytes, not as the string "0x"', async () => {
    const { action, signature } = await signHyperliquidSendToEvmWithData(
      PRIVATE_KEY,
      ADDRESS,
      '12.3',
      3,
      1710000000123,
      true,
      ''
    );
    const domain = {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 421614,
      verifyingContract: ZERO_ADDRESS,
    };
    const asString = {
      'HyperliquidTransaction:SendToEvmWithData': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'token', type: 'string' },
        { name: 'amount', type: 'string' },
        { name: 'sourceDex', type: 'string' },
        { name: 'destinationRecipient', type: 'string' },
        { name: 'addressEncoding', type: 'string' },
        { name: 'destinationChainId', type: 'uint32' },
        { name: 'gasLimit', type: 'uint64' },
        { name: 'data', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    };

    // 把 `data` 当成字符串来读会恢复出不同的签名者，
    // 而这正是一个错误编码看上去完全合法地送到交易场所的方式。
    expect(ethers.verifyTypedData(domain, asString, action, signature)).not.toBe(
      ADDRESS
    );
  });
});
