import { Injectable } from '@angular/core';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { of, forkJoin } from 'rxjs';
import { map, catchError, timeout } from 'rxjs/operators';
import { ChromeService } from './chrome.service';
import {
  ChainType,
  STORAGE_NAME,
  INIT_ACCOUNT,
  UPDATE_NEO3_NETWORKS,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_WALLET,
  RpcNetwork,
  UPDATE_NEO2_NETWORKS,
  UPDATE_NEO3_WALLETS_ADDRESS,
  N3T4NetworkChainId,
  DEFAULT_N2_RPC_NETWORK,
  DEFAULT_N3_RPC_NETWORK,
  UPDATE_NEOX_NETWORKS,
} from '@popup/_lib';
import { HttpClient } from '@angular/common/http';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { DEFAULT_NEOX_RPC_NETWORK } from '@/app/popup/_lib/evm';
import { parseWallet } from '../utils/app';

@Injectable()
export class InitService {
  private hasGetFastRpc = false;
  private loadingGetFastRpc = false;

  private n2Networks: RpcNetwork[];
  private n3Networks: RpcNetwork[];
  constructor(
    private chrome: ChromeService,
    private http: HttpClient,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.n2Networks = state.n2Networks;
      this.n3Networks = state.n3Networks;
    });
  }

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
        const address = walletRes.accounts[0].address;
        const chainType: ChainType = ethers.isAddress(address)
          ? 'NeoX'
          : wallet3.isAddress(address, 53)
          ? 'Neo3'
          : 'Neo2';
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
            n2NetworkIndex: n2NetworkIndexRes,
            n3NetworkIndex: n3NetworkIndexRes,
            neoXNetworkIndex: neoXNetworkIndexRes,
          },
        });
        //#region update default network
        let getFastRPCFlag = false;
        if (
          !n2NetworksRes[0].version ||
          n2NetworksRes[0].version !== DEFAULT_N2_RPC_NETWORK[0].version
        ) {
          getFastRPCFlag = true;
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
          getFastRPCFlag = true;
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
        this.getFastRpcUrl(getFastRPCFlag);
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

  //#region private
  private async getRpcUrls(force = false) {
    if (this.hasGetFastRpc && !force) {
      return null;
    }
    const defaultRpcUrls = await this.chrome
      .getStorage(STORAGE_NAME.rpcUrls)
      .toPromise();
    const headers = {};
    if (defaultRpcUrls.lastModified) {
      headers['If-Modified-Since'] = defaultRpcUrls.lastModified;
    }
    try {
      const responseRpcUrl = await this.http
        .get('https://cdn.neoline.io/nodelist.json', {
          headers,
          observe: 'response',
        })
        .pipe(
          map((res) => {
            const lastModified = res.headers.get('Last-Modified');
            this.chrome.setStorage(STORAGE_NAME.rpcUrls, {
              nodes: res.body,
              lastModified,
            });
            return res.body;
          })
        )
        .toPromise();
      return responseRpcUrl;
    } catch (error) {
      const shouldFindNode = await this.chrome.getShouldFindNode();
      if (shouldFindNode !== false || force) {
        return defaultRpcUrls.nodes;
      }
      return null;
    }
  }
  private async getFastRpcUrl(force = false) {
    if (this.loadingGetFastRpc && !force) {
      return;
    }
    this.loadingGetFastRpc = true;
    const rpcUrls = await this.getRpcUrls(force);
    if (rpcUrls === null) {
      this.loadingGetFastRpc = false;
      return;
    }
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getversion',
      params: [],
    };
    const startTime = new Date().getTime();
    const netReqs = { 1: [], 2: [], 3: [], 4: [], 6: [] };
    const spendTiems = { 1: [], 2: [], 3: [], 4: [], 6: [] };
    const fastIndex = { 1: 0, 2: 0, 3: 0, 4: 0, 6: 0 };
    Object.keys(rpcUrls).forEach((key) => {
      netReqs[key] = [];
      spendTiems[key] = [];
      fastIndex[key] = 0;
      rpcUrls[key].forEach((item, index) => {
        const req = this.http.post(item, data).pipe(
          catchError(() => of(null)),
          timeout(5000),
          catchError(() => of(null)),
          map((res) => {
            spendTiems[key][index] = res
              ? new Date().getTime() - startTime
              : -1;
            return res;
          })
        );
        netReqs[key].push(req);
      });
    });
    forkJoin([
      ...netReqs[1],
      ...netReqs[2],
      ...netReqs[3],
      ...netReqs[6],
    ]).subscribe(() => {
      Object.keys(spendTiems).forEach((key) => {
        spendTiems[key].forEach((time, index) => {
          if (time !== -1 && time < spendTiems[key][fastIndex[key]]) {
            fastIndex[key] = index;
          }
        });
      });
      this.n2Networks[0].rpcUrl = rpcUrls[1][fastIndex[1]];
      // this.n2Networks[1].rpcUrl = rpcUrls[2][fastIndex[2]];
      this.n3Networks[0].rpcUrl = rpcUrls[3][fastIndex[3]];
      this.n3Networks[1].rpcUrl = rpcUrls[6][fastIndex[6]];
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORKS,
        data: this.n3Networks,
      });
      this.store.dispatch({
        type: UPDATE_NEO2_NETWORKS,
        data: this.n2Networks,
      });
      this.loadingGetFastRpc = false;
      this.hasGetFastRpc = true;
      this.chrome.setShouldFindNode(false);
    });
  }
  //#endregion
}
