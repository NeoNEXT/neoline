import { of } from 'rxjs';
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
