import { ethers } from 'ethers';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { BehaviorSubject } from 'rxjs';
import { EvmAssetService } from './asset.service';

describe('EvmAssetService', () => {
  const neoXNetwork = {
    name: 'NeoX Testnet',
    rpcUrl: 'http://127.0.0.1:8545',
    network: 'EVM',
    chainId: 12227332,
    id: 1,
    symbol: 'GAS',
  };

  let accountState$: BehaviorSubject<any>;
  let service: EvmAssetService;

  beforeEach(() => {
    accountState$ = new BehaviorSubject<any>({
      neoXNetworks: [neoXNetwork],
      neoXNetworkIndex: 0,
    });
    const store = jasmine.createSpyObj('Store', ['select']);
    store.select.and.returnValue(accountState$.asObservable());

    service = new EvmAssetService(store);
  });

  afterEach(() => {
    (service as any).provider?.destroy();
  });

  [
    { chainId: 47763, contract: '0xc28736dc83f4fd43d6fb832Fd93c3eE7bB26828f' },
    { chainId: 12227332, contract: '0xab0a26b8d903f36acb4bf9663f8d2de0672433cd' },
  ].forEach(({ chainId, contract }) => {
    it(`includes NEO in the default assets for chain ${chainId}`, async () => {
      accountState$.next({
        neoXNetworks: [{ ...neoXNetwork, chainId }],
        neoXNetworkIndex: 0,
      });
      const provider = (service as any).provider;
      spyOn(provider, 'getBalance').and.resolveTo(ethers.parseEther('2'));
      const callSpy = spyOn(provider, 'call').and.resolveTo(
        ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [ethers.parseEther('3')])
      );
      const address = '0x0000000000000000000000000000000000000001';

      const assets = await service.getNeoXAddressBalances(address);

      expect(assets).toEqual([
        { asset_id: ETH_SOURCE_ASSET_HASH, symbol: 'GAS', decimals: 18, balance: '2.0' },
        { asset_id: contract, symbol: 'NEO', decimals: 18, balance: '3.0' },
      ]);
      const request = callSpy.calls.mostRecent().args[0] as ethers.TransactionRequest;
      expect(request.to.toString().toLowerCase()).toBe(contract.toLowerCase());
      expect(request.data).toBe(
        new ethers.Interface(['function balanceOf(address) view returns (uint256)'])
          .encodeFunctionData('balanceOf', [address])
      );
    });
  });

  it('only includes the native asset for other EVM networks', async () => {
    accountState$.next({
      neoXNetworks: [{ ...neoXNetwork, chainId: 1, symbol: 'ETH' }],
      neoXNetworkIndex: 0,
    });
    const provider = (service as any).provider;
    spyOn(provider, 'getBalance').and.resolveTo(ethers.parseEther('1'));
    const callSpy = spyOn(provider, 'call');

    expect(await service.getNeoXAddressBalances(
      '0x0000000000000000000000000000000000000001'
    )).toEqual([
      { asset_id: ETH_SOURCE_ASSET_HASH, symbol: 'ETH', decimals: 18, balance: '1.0' },
    ]);
    expect(callSpy).not.toHaveBeenCalled();
  });

  it('keeps the active provider when account state changes without a NeoX network change', () => {
    const provider = (service as any).provider;
    const destroySpy = spyOn(provider, 'destroy').and.callThrough();

    accountState$.next({
      neoXNetworks: [{ ...neoXNetwork }],
      neoXNetworkIndex: 0,
      neoXWalletArr: [],
    });

    expect((service as any).provider).toBe(provider);
    expect(destroySpy).not.toHaveBeenCalled();
  });
});
