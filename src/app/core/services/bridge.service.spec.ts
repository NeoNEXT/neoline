import { of } from 'rxjs';
import { ethers } from 'ethers';
import { BridgeService } from './bridge.service';
import {
  BridgeNetwork,
  BRIDGE_EVENTS_ABI,
  ETH_SOURCE_ASSET_HASH,
  GAS3_CONTRACT,
} from '@/app/popup/_lib';
import { Asset } from '@/models/models';

function createService(http?: any) {
  const store = {
    select: () =>
      of({
        neoXNetworks: [
          { name: 'NeoX', chainId: 47763, rpcUrl: 'https://neox.example' },
        ],
        neoXNetworkIndex: 0,
        n3Networks: [
          { name: 'N3', chainId: 860833102, rpcUrl: 'https://n3.example' },
        ],
        n3NetworkIndex: 0,
      }),
  } as any;
  return new BridgeService(store, null, http);
}

const gasAsset = {
  symbol: 'GAS',
  asset_id: GAS3_CONTRACT,
  decimals: 8,
} as Asset;

describe('BridgeService.getNonceFromTransactionReceipt', () => {
  const iface = new ethers.Interface(BRIDGE_EVENTS_ABI);
  const nativeWithdrawal = iface.encodeEventLog('NativeWithdrawal', [
    7n,
    '0x0000000000000000000000000000000000000002',
    1000n,
    '0x0000000000000000000000000000000000000003',
    ethers.ZeroHash,
    ethers.ZeroHash,
  ]);

  it('reads the nonce out of the withdrawal event', () => {
    const service = createService();

    expect(
      service.getNonceFromTransactionReceipt(
        { logs: [nativeWithdrawal] },
        { asset_id: ETH_SOURCE_ASSET_HASH } as Asset
      )
    ).toBe(7);
  });

  it('skips a log that matches the topic but not the ABI', () => {
    const service = createService();
    // Same topic0, truncated payload — parseLog throws on this one. Bailing out
    // would strand the caller, which has already stopped polling by then.
    const malformed = { ...nativeWithdrawal, data: '0x1234' };

    expect(
      service.getNonceFromTransactionReceipt(
        { logs: [malformed, nativeWithdrawal] },
        { asset_id: ETH_SOURCE_ASSET_HASH } as Asset
      )
    ).toBe(7);
  });

  it('returns null when the receipt carries no withdrawal', () => {
    const service = createService();

    expect(
      service.getNonceFromTransactionReceipt({ logs: [] }, {
        asset_id: ETH_SOURCE_ASSET_HASH,
      } as Asset)
    ).toBeNull();
  });
});

describe('BridgeService deposit info cache', () => {
  const stackValue = (value: string) => ({
    state: 'HALT',
    stack: [{ type: 'Integer', value }],
  });

  it('does not cache a partial answer', async () => {
    const responses = [
      // First call: the node answers, but the fee is missing.
      [{ result: undefined }, { result: stackValue('1') }, { result: stackValue('2') }],
      [
        { result: stackValue('1000000') },
        { result: stackValue('100000000') },
        { result: stackValue('200000000') },
      ],
    ];
    let call = 0;
    const http = { rpcPostReturnAllData: () => of(responses[call++]) };
    const service = createService(http);

    const first = await service
      .getBridgeInfo('Neo3', BridgeNetwork.MainNet, gasAsset)
      .toPromise();
    expect(first.bridgeFee).toBe('');

    // A second attempt must hit the node again rather than replay the blanks.
    const second = await service
      .getBridgeInfo('Neo3', BridgeNetwork.MainNet, gasAsset)
      .toPromise();
    expect(second.bridgeFee).toBe('0.01');
    expect(call).toBe(2);
  });

  it('serves a complete answer from cache', async () => {
    let call = 0;
    const http = {
      rpcPostReturnAllData: () => {
        call++;
        return of([
          { result: stackValue('1000000') },
          { result: stackValue('100000000') },
          { result: stackValue('200000000') },
        ]);
      },
    };
    const service = createService(http);

    await service
      .getBridgeInfo('Neo3', BridgeNetwork.MainNet, gasAsset)
      .toPromise();
    const cached = await service
      .getBridgeInfo('Neo3', BridgeNetwork.MainNet, gasAsset)
      .toPromise();

    expect(cached.bridgeFee).toBe('0.01');
    expect(call).toBe(1);
  });
});
