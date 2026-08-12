import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ChromeService } from './chrome.service';
import {
  ChainType,
  STORAGE_NAME,
  INIT_ACCOUNT,
  UPDATE_NEO3_NETWORKS,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_WALLET,
  UPDATE_NEO2_NETWORKS,
  UPDATE_NEO3_WALLETS_ADDRESS,
  N3T4NetworkChainId,
  DEFAULT_N2_RPC_NETWORK,
  DEFAULT_N3_RPC_NETWORK,
  DEFAULT_RPC_URLS,
  RpcNetwork,
  clampNetworkIndex,
  UPDATE_NEOX_NETWORKS,
} from '@popup/_lib';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { DEFAULT_NEOX_RPC_NETWORK } from '@/app/popup/_lib/evm';
import { migrateLegacyNeoXHDWallets, parseWallet } from '../utils/app';

const RPC_NODE_LIST_URL = 'https://cdn.neoline.io/nodelist.json';
const RPC_NODE_TIMEOUT = 5000;

type RpcUrlMap = Record<string, string[]>;
type RpcUrlStorage = {
  lastModified?: string;
  nodes?: RpcUrlMap;
};

@Injectable()
export class InitService {
  private hasUpdatedFastRpc = false;
  private updatingFastRpc = false;
  private initPromise?: Promise<void>;

  constructor(
    private chrome: ChromeService,
    private store: Store<AppState>,
    private http: HttpClient
  ) {}

  public initData(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    const storageNames = [
      STORAGE_NAME.wallet,
      STORAGE_NAME.WIFArr,
      STORAGE_NAME['WIFArr-Neo3'],
      STORAGE_NAME.walletArr,
      STORAGE_NAME['walletArr-Neo3'],
      STORAGE_NAME['walletArr-NeoX'],
      STORAGE_NAME.neo3AddressFlag,
      STORAGE_NAME.n2Networks,
      STORAGE_NAME.n2SelectedNetworkIndex,
      STORAGE_NAME.n3Networks,
      STORAGE_NAME.n3SelectedNetworkIndex,
      STORAGE_NAME.neoXNetworks,
      STORAGE_NAME.neoXSelectedNetworkIndex,
    ];

    this.initPromise = firstValueFrom(this.chrome.getStorages(storageNames))
      .then((storage) => this.hydrate(storage))
      .catch((error) => {
        // 失败的水合结果绝不能被缓存：guard 每次导航都会 await 它，
        // 缓存一个 rejected promise 会让弹窗永久卡在启动页，且无法重试。
        // Never cache a failed hydration: guards await this on every
        // navigation, so a stuck rejected promise would freeze the popup with
        // no way to retry.
        this.initPromise = undefined;
        throw error;
      });

    return this.initPromise;
  }

  private hydrate(storage: Partial<Record<STORAGE_NAME, any>>): void {
    let walletRes = storage[STORAGE_NAME.wallet];
    const neo2WIFArrRes = storage[STORAGE_NAME.WIFArr];
    const neo3WIFArrRes = storage[STORAGE_NAME['WIFArr-Neo3']];
    let neo2WalletArrRes = storage[STORAGE_NAME.walletArr];
    let neo3WalletArrRes = storage[STORAGE_NAME['walletArr-Neo3']];
    let neoXWalletArrRes = storage[STORAGE_NAME['walletArr-NeoX']];
    const Neo3AddressFlagRes = storage[STORAGE_NAME.neo3AddressFlag];
    let n2NetworksRes = storage[STORAGE_NAME.n2Networks];
    const n2NetworkIndexRes = storage[STORAGE_NAME.n2SelectedNetworkIndex];
    let n3NetworksRes = storage[STORAGE_NAME.n3Networks];
    const n3NetworkIndexRes = storage[STORAGE_NAME.n3SelectedNetworkIndex];
    let neoXNetworksRes = storage[STORAGE_NAME.neoXNetworks];
    const neoXNetworkIndexRes =
      storage[STORAGE_NAME.neoXSelectedNetworkIndex];

    // wallet
    walletRes = parseWallet(walletRes);
    if (!walletRes) {
      return;
    }
    // neo2 walletArr
    if (neo2WalletArrRes && neo2WalletArrRes.length > 0) {
      const tempArr = [];
      neo2WalletArrRes.forEach((item) => {
        tempArr.push(parseWallet(item));
      });
      neo2WalletArrRes = tempArr;
    }
    // neo3 walletArr
    if (neo3WalletArrRes && neo3WalletArrRes.length > 0) {
      const tempArr = [];
      neo3WalletArrRes.forEach((item) => {
        tempArr.push(parseWallet(item));
      });
      neo3WalletArrRes = tempArr;
    }
    const neoXMigration = migrateLegacyNeoXHDWallets(
      neoXWalletArrRes || []
    );
    neoXWalletArrRes = neoXMigration.walletArr;
    if (neoXMigration.changed) {
      this.chrome.setStorage(
        STORAGE_NAME['walletArr-NeoX'],
        neoXWalletArrRes
      );
    }
    if (ethers.isAddress(walletRes.accounts[0].address)) {
      const migratedCurrentWallet = neoXWalletArrRes.find(
        (item) =>
          item.accounts[0].address === walletRes.accounts[0].address
      );
      if (migratedCurrentWallet) {
        walletRes = migratedCurrentWallet;
        if (neoXMigration.changed) {
          this.chrome.setStorage(STORAGE_NAME.wallet, walletRes);
        }
      }
    }
    const address = walletRes.accounts[0].address;
    const chainType: ChainType = ethers.isAddress(address)
      ? 'NeoX'
      : wallet3.isAddress(address, 53)
      ? 'Neo3'
      : 'Neo2';
    // Clamp any out-of-range stored index, and persist the correction so a
    // stale selection doesn't keep re-loading (and crashing) every launch.
    const n2NetworkIndex = clampNetworkIndex(
      n2NetworksRes,
      n2NetworkIndexRes
    );
    const n3NetworkIndex = clampNetworkIndex(
      n3NetworksRes,
      n3NetworkIndexRes
    );
    const neoXNetworkIndex = clampNetworkIndex(
      neoXNetworksRes,
      neoXNetworkIndexRes
    );
    if (n2NetworkIndex !== n2NetworkIndexRes) {
      this.chrome.setStorage(
        STORAGE_NAME.n2SelectedNetworkIndex,
        n2NetworkIndex
      );
    }
    if (n3NetworkIndex !== n3NetworkIndexRes) {
      this.chrome.setStorage(
        STORAGE_NAME.n3SelectedNetworkIndex,
        n3NetworkIndex
      );
    }
    if (neoXNetworkIndex !== neoXNetworkIndexRes) {
      this.chrome.setStorage(
        STORAGE_NAME.neoXSelectedNetworkIndex,
        neoXNetworkIndex
      );
    }
    this.store.dispatch({
      type: INIT_ACCOUNT,
      data: {
        currentWallet: walletRes,
        currentChainType: chainType,
        neo2WalletArr: neo2WalletArrRes || [],
        neo3WalletArr: neo3WalletArrRes || [],
        neoXWalletArr: neoXWalletArrRes || [],
        neo2WIFArr: neo2WIFArrRes || [],
        neo3WIFArr: neo3WIFArrRes || [],
        n2Networks: n2NetworksRes || [],
        n3Networks: n3NetworksRes || [],
        neoXNetworks: neoXNetworksRes || [],
        n2NetworkIndex,
        n3NetworkIndex,
        neoXNetworkIndex,
      },
    });
    //#region update default network
    if (
      !n2NetworksRes[0].version ||
      n2NetworksRes[0].version !== DEFAULT_N2_RPC_NETWORK[0].version
    ) {
      n2NetworksRes = DEFAULT_N2_RPC_NETWORK;
      this.store.dispatch({
        type: UPDATE_NEO2_NETWORKS,
        data: n2NetworksRes,
      });
    }
    if (
      !n3NetworksRes[0].version ||
      n3NetworksRes[0].version !== DEFAULT_N3_RPC_NETWORK[0].version
    ) {
      if (!n3NetworksRes[0].version) {
        if (n3NetworksRes[1].chainId === N3T4NetworkChainId) {
          n3NetworksRes.splice(0, 3);
        } else {
          n3NetworksRes.splice(0, 2);
        }
      } else {
        n3NetworksRes = n3NetworksRes.filter((item) => !item.version);
      }
      n3NetworksRes.unshift(...DEFAULT_N3_RPC_NETWORK);
      this.store.dispatch({ type: UPDATE_NEO3_NETWORK_INDEX, data: 0 });
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORKS,
        data: n3NetworksRes,
      });
    }
    if (
      neoXNetworksRes[0].version !== DEFAULT_NEOX_RPC_NETWORK[0].version
    ) {
      neoXNetworksRes = neoXNetworksRes.filter((item) => !item.version);
      neoXNetworksRes.unshift(...DEFAULT_NEOX_RPC_NETWORK);
      this.store.dispatch({
        type: UPDATE_NEOX_NETWORKS,
        data: neoXNetworksRes,
      });
    }
    //#endregion
    this.updateFastNeoRpcNetworks(n2NetworksRes, n3NetworksRes);
    if (
      !Neo3AddressFlagRes &&
      neo3WIFArrRes &&
      neo3WIFArrRes.length > 0 &&
      neo3WalletArrRes &&
      neo3WalletArrRes.length > 0
    ) {
      neo3WalletArrRes.forEach((item, index) => {
        if (
          item.accounts[0]?.extra?.ledgerSLIP44 ||
          !neo3WIFArrRes[index]
        ) {
          return;
        }
        const account = new wallet3.Account(
          wallet3.getPrivateKeyFromWIF(neo3WIFArrRes[index])
        );
        Object.defineProperties(item.accounts[0], {
          address: { writable: true },
        });
        item.accounts[0].address = account.address;
        item.accounts[0].label = account.label;
        if (
          item.accounts[0].contract.script ===
          walletRes.accounts[0].contract.script
        ) {
          Object.defineProperties(walletRes.accounts[0], {
            address: { writable: true },
          });
          walletRes.accounts[0].address = item.accounts[0].address;
          walletRes.accounts[0].label = item.accounts[0].label;
          this.store.dispatch({ type: UPDATE_WALLET, data: walletRes });
          this.chrome.accountChangeEvent(walletRes);
        }
      });
      this.store.dispatch({
        type: UPDATE_NEO3_WALLETS_ADDRESS,
        data: neo3WalletArrRes,
      });
      this.chrome.setStorage(STORAGE_NAME.neo3AddressFlag, true);
    }
  }

  private async updateFastNeoRpcNetworks(
    n2Networks: RpcNetwork[],
    n3Networks: RpcNetwork[]
  ) {
    if (this.hasUpdatedFastRpc || this.updatingFastRpc) {
      return;
    }

    this.updatingFastRpc = true;
    try {
      const rpcUrls = await this.getRpcUrlsForFastLookup();
      if (!rpcUrls) {
        return;
      }

      const [nextN2Networks, nextN3Networks] = await Promise.all([
        this.getNetworksWithFastRpc(n2Networks, rpcUrls),
        this.getNetworksWithFastRpc(n3Networks, rpcUrls),
      ]);

      this.store.dispatch({
        type: UPDATE_NEO2_NETWORKS,
        data: nextN2Networks,
      });
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORKS,
        data: nextN3Networks,
      });
      await this.chrome.setShouldFindNode(false);
      this.hasUpdatedFastRpc = true;
    } finally {
      this.updatingFastRpc = false;
    }
  }

  private async getRpcUrlsForFastLookup(): Promise<RpcUrlMap | null> {
    const cachedRpcUrls: RpcUrlStorage = await firstValueFrom(
      this.chrome.getStorage(STORAGE_NAME.rpcUrls)
    );
    const headers = {};
    if (cachedRpcUrls?.lastModified) {
      headers['If-Modified-Since'] = cachedRpcUrls.lastModified;
    }

    try {
      const response = await firstValueFrom(
        this.http.get<RpcUrlMap>(RPC_NODE_LIST_URL, {
          headers,
          observe: 'response',
        })
      );
      if (response.body && Object.keys(response.body).length > 0) {
        this.chrome.setStorage(STORAGE_NAME.rpcUrls, {
          nodes: response.body,
          lastModified: response.headers.get('Last-Modified'),
        });
        return response.body;
      }
    } catch (error) {
      // 304 and request failures have no usable response body.
    }

    const shouldFindNode = await this.chrome.getShouldFindNode();
    const nodes = cachedRpcUrls?.nodes || DEFAULT_RPC_URLS.nodes;
    return shouldFindNode ? nodes : null;
  }

  private async getNetworksWithFastRpc(
    networks: RpcNetwork[],
    rpcUrls: RpcUrlMap
  ): Promise<RpcNetwork[]> {
    const nextNetworks = await Promise.all(
      networks.map(async (network) => {
        if (!network.version) {
          return network;
        }

        const urls = this.getRpcUrlsByChainId(rpcUrls, network.chainId);
        if (urls.length === 0) {
          return network;
        }

        return {
          ...network,
          rpcUrl: await this.getFastRpcUrl(urls, network.rpcUrl),
          rpcUrlArr: urls.map((url) => ({ url })),
        };
      })
    );
    return nextNetworks;
  }

  private getRpcUrlsByChainId(rpcUrls: RpcUrlMap, chainId: number): string[] {
    const urls = rpcUrls?.[chainId] || rpcUrls?.[String(chainId)] || [];
    return Array.isArray(urls) ? urls.filter((url) => !!url) : [];
  }

  private async getFastRpcUrl(urls: string[], fallbackUrl: string) {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getversion',
      params: [],
    };
    const results = await Promise.all(
      urls.map(async (url) => {
        const startTime = Date.now();
        const response: any = await firstValueFrom(
          this.http.post(url, data).pipe(
            timeout(RPC_NODE_TIMEOUT),
            catchError(() => of(null))
          )
        );
        return {
          url,
          time: Date.now() - startTime,
          available: !!response?.result,
        };
      })
    );
    const fastest = results
      .filter((item) => item.available)
      .sort((a, b) => a.time - b.time)[0];
    return fastest?.url || fallbackUrl;
  }
}
