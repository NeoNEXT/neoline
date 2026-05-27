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
