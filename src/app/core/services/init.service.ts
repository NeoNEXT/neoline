import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { firstValueFrom, forkJoin, of } from 'rxjs';
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

  constructor(
    private chrome: ChromeService,
    private store: Store<AppState>,
    private http: HttpClient
  ) {}

  public initData() {
    const getWallet = this.chrome.getStorage(STORAGE_NAME.wallet);
    const getNeo2WIFArr = this.chrome.getStorage(STORAGE_NAME.WIFArr);
    const getNeo3WIFArr = this.chrome.getStorage(STORAGE_NAME['WIFArr-Neo3']);
    const getNeo2WalletArr = this.chrome.getStorage(STORAGE_NAME.walletArr);
    const getNeo3WalletArr = this.chrome.getStorage(
      STORAGE_NAME['walletArr-Neo3']
    );
    const getNeoXWalletArr = this.chrome.getStorage(
      STORAGE_NAME['walletArr-NeoX']
    );
    const Neo3AddressFlag = this.chrome.getStorage(
      STORAGE_NAME.neo3AddressFlag
    );
    //#region networks
    const getN2Networks = this.chrome.getStorage(STORAGE_NAME.n2Networks);
    const getN3Networks = this.chrome.getStorage(STORAGE_NAME.n3Networks);
    const getNeoXNetworks = this.chrome.getStorage(STORAGE_NAME.neoXNetworks);
    const getN2SelectedNetworkIndex = this.chrome.getStorage(
      STORAGE_NAME.n2SelectedNetworkIndex
    );
    const getN3SelectedNetworkIndex = this.chrome.getStorage(
      STORAGE_NAME.n3SelectedNetworkIndex
    );
    const getNeoXSelectedNetworkIndex = this.chrome.getStorage(
      STORAGE_NAME.neoXSelectedNetworkIndex
    );
    //#endregion
    forkJoin([
      getWallet,
      getNeo2WIFArr,
      getNeo3WIFArr,
      getNeo2WalletArr,
      getNeo3WalletArr,
      getNeoXWalletArr,
      Neo3AddressFlag,
      getN2Networks,
      getN2SelectedNetworkIndex,
      getN3Networks,
      getN3SelectedNetworkIndex,
      getNeoXNetworks,
      getNeoXSelectedNetworkIndex,
    ]).subscribe(
      ([
        walletRes,
        neo2WIFArrRes,
        neo3WIFArrRes,
        neo2WalletArrRes,
        neo3WalletArrRes,
        neoXWalletArrRes,
        Neo3AddressFlagRes,
        n2NetworksRes,
        n2NetworkIndexRes,
        n3NetworksRes,
        n3NetworkIndexRes,
        neoXNetworksRes,
        neoXNetworkIndexRes,
      ]) => {
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
    );
  }

  private async updateFastNeoRpcNetworks(
    n2Networks: RpcNetwork[],
    n3Networks: RpcNetwork[]
  ) {
    if (this.hasUpdatedFastRpc || this.updatingFastRpc) {
      return;
    }
    const shouldFindNode = await this.chrome.getShouldFindNode();
    if (!shouldFindNode) {
      return;
    }

    this.updatingFastRpc = true;
    const rpcUrls = await this.getRpcUrls();
    if (!rpcUrls) {
      this.updatingFastRpc = false;
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
    this.chrome.setShouldFindNode(false);
    this.hasUpdatedFastRpc = true;
    this.updatingFastRpc = false;
  }

  private async getRpcUrls(): Promise<RpcUrlMap | null> {
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
      const nodes = response.body || cachedRpcUrls?.nodes || DEFAULT_RPC_URLS.nodes;
      this.chrome.setStorage(STORAGE_NAME.rpcUrls, {
        nodes,
        lastModified: response.headers.get('Last-Modified'),
      });
      return nodes;
    } catch (error) {
      return cachedRpcUrls?.nodes || DEFAULT_RPC_URLS.nodes || null;
    }
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
