import { of, throwError } from 'rxjs';
import {
  DEFAULT_N2_RPC_NETWORK,
  DEFAULT_N3_RPC_NETWORK,
  NetworkType,
  RpcNetwork,
  STORAGE_NAME,
  UPDATE_NEO2_NETWORKS,
  UPDATE_NEO3_NETWORKS,
  UPDATE_NEOX_NETWORKS,
} from '@popup/_lib';
import { InitService } from './init.service';

describe('InitService', () => {
  function createService({
    shouldFindNode = true,
    remoteNodes = {
      1: ['http://n2-slow.example', 'http://n2-fast.example'],
      3: ['http://n3-main-slow.example', 'http://n3-main-fast.example'],
      6: ['http://n3-test-slow.example', 'http://n3-test-fast.example'],
    },
  } = {}) {
    const chrome = {
      getShouldFindNode: jasmine
        .createSpy('getShouldFindNode')
        .and.resolveTo(shouldFindNode),
      setShouldFindNode: jasmine.createSpy('setShouldFindNode'),
      getStorage: jasmine.createSpy('getStorage').and.callFake((key) => {
        if (key === STORAGE_NAME.rpcUrls) {
          return of({ nodes: {}, lastModified: 'old-modified' });
        }
        return of(undefined);
      }),
      getStorages: jasmine.createSpy('getStorages').and.returnValue(
        of({
          [STORAGE_NAME.wallet]: undefined,
          [STORAGE_NAME.WIFArr]: [],
          [STORAGE_NAME['WIFArr-Neo3']]: [],
          [STORAGE_NAME.walletArr]: [],
          [STORAGE_NAME['walletArr-Neo3']]: [],
          [STORAGE_NAME['walletArr-NeoX']]: [],
          [STORAGE_NAME.neo3AddressFlag]: true,
          [STORAGE_NAME.n2Networks]: DEFAULT_N2_RPC_NETWORK,
          [STORAGE_NAME.n2SelectedNetworkIndex]: 0,
          [STORAGE_NAME.n3Networks]: DEFAULT_N3_RPC_NETWORK,
          [STORAGE_NAME.n3SelectedNetworkIndex]: 0,
          [STORAGE_NAME.neoXNetworks]: [],
          [STORAGE_NAME.neoXSelectedNetworkIndex]: 0,
        })
      ),
      setStorage: jasmine.createSpy('setStorage'),
    };
    const store = {
      dispatch: jasmine.createSpy('dispatch'),
    };
    const http = {
      get: jasmine.createSpy('get').and.returnValue(
        of({
          body: remoteNodes,
          headers: { get: () => 'new-modified' },
        })
      ),
      post: jasmine.createSpy('post'),
    };
    const service = new InitService(chrome as any, store as any, http as any);
    spyOn<any>(service, 'getFastRpcUrl').and.callFake(
      async (urls: string[], fallbackUrl: string) => urls[1] || fallbackUrl
    );
    return { service, chrome, store, http };
  }

  it('loads remote Neo2/Neo3 nodes, selects fast RPCs, and persists networks', async () => {
    const { service, chrome, store, http } = createService();

    await (service as any).updateFastNeoRpcNetworks(
      [...DEFAULT_N2_RPC_NETWORK],
      [...DEFAULT_N3_RPC_NETWORK]
    );

    expect(http.get).toHaveBeenCalledWith(
      'https://cdn.neoline.io/nodelist.json',
      jasmine.objectContaining({
        observe: 'response',
      })
    );
    expect(chrome.setStorage).toHaveBeenCalledWith(STORAGE_NAME.rpcUrls, {
      nodes: jasmine.any(Object),
      lastModified: 'new-modified',
    });
    expect(store.dispatch).toHaveBeenCalledWith({
      type: UPDATE_NEO2_NETWORKS,
      data: [
        jasmine.objectContaining({
          chainId: 1,
          rpcUrl: 'http://n2-fast.example',
          rpcUrlArr: [
            { url: 'http://n2-slow.example' },
            { url: 'http://n2-fast.example' },
          ],
        }),
      ],
    });
    expect(store.dispatch).toHaveBeenCalledWith({
      type: UPDATE_NEO3_NETWORKS,
      data: [
        jasmine.objectContaining({
          chainId: 3,
          rpcUrl: 'http://n3-main-fast.example',
        }),
        jasmine.objectContaining({
          chainId: 6,
          rpcUrl: 'http://n3-test-fast.example',
        }),
      ],
    });
    expect(store.dispatch).not.toHaveBeenCalledWith(
      jasmine.objectContaining({ type: UPDATE_NEOX_NETWORKS })
    );
    expect(chrome.setShouldFindNode).toHaveBeenCalledWith(false);
  });

  it('shares one batched storage hydration across startup consumers', async () => {
    const { service, chrome } = createService();

    const first = service.initData();
    const second = service.initData();

    expect(first).toBe(second);
    await first;
    expect(chrome.getStorages).toHaveBeenCalledTimes(1);
    expect(chrome.getStorages.calls.mostRecent().args[0].length).toBe(13);
  });

  it('does not cache a failed hydration, so startup can be retried', async () => {
    const { service, chrome } = createService();
    chrome.getStorages.and.returnValue(
      throwError(() => new Error('storage unavailable'))
    );

    await expectAsync(service.initData()).toBeRejected();

    chrome.getStorages.and.returnValue(
      of({
        [STORAGE_NAME.wallet]: undefined,
        [STORAGE_NAME.n2Networks]: DEFAULT_N2_RPC_NETWORK,
        [STORAGE_NAME.n3Networks]: DEFAULT_N3_RPC_NETWORK,
        [STORAGE_NAME.neoXNetworks]: [],
      })
    );

    await expectAsync(service.initData()).toBeResolved();
    expect(chrome.getStorages).toHaveBeenCalledTimes(2);
  });

  it('does not cache a hydration that throws while parsing storage', async () => {
    const { service, chrome } = createService();
    // n2Networks 为空数组时会在读取 [0].version 时抛错。
    // An empty n2Networks array makes the [0].version read throw.
    chrome.getStorages.and.returnValue(
      of({
        [STORAGE_NAME.wallet]: { accounts: [{ address: 'NgaiKF' }] },
        [STORAGE_NAME.n2Networks]: [],
        [STORAGE_NAME.n3Networks]: DEFAULT_N3_RPC_NETWORK,
        [STORAGE_NAME.neoXNetworks]: [],
      })
    );

    await expectAsync(service.initData()).toBeRejected();
    await expectAsync(service.initData()).toBeRejected();
    expect(chrome.getStorages).toHaveBeenCalledTimes(2);
  });

  it('keeps custom Neo3 networks out of remote fast-RPC replacement', async () => {
    const { service, store } = createService();
    const customNetwork: RpcNetwork = {
      id: 99,
      name: 'Custom N3',
      rpcUrl: 'http://custom.example',
      network: NetworkType.N3PrivateNet,
      chainId: 0,
    };

    await (service as any).updateFastNeoRpcNetworks(
      [...DEFAULT_N2_RPC_NETWORK],
      [...DEFAULT_N3_RPC_NETWORK, customNetwork]
    );

    const n3Dispatch = store.dispatch.calls
      .allArgs()
      .map(([action]) => action)
      .find((action) => action.type === UPDATE_NEO3_NETWORKS);

    expect(n3Dispatch.data[2]).toBe(customNetwork);
  });

  it('does not load remote nodes when fast-RPC lookup is disabled for the session', async () => {
    const { service, store, http } = createService({ shouldFindNode: false });

    await (service as any).updateFastNeoRpcNetworks(
      [...DEFAULT_N2_RPC_NETWORK],
      [...DEFAULT_N3_RPC_NETWORK]
    );

    expect(http.get).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
