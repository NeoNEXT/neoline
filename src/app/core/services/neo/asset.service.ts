import { Injectable } from '@angular/core';
import { HttpService } from '../http.service';
import { ChromeService } from '../chrome.service';
import { Observable } from 'rxjs';
import { Asset, NEO, GAS, UTXO } from 'src/models/models';
import { map } from 'rxjs/operators';
import { RpcNetwork } from '@popup/_lib/type';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import {
  NEO3_CONTRACT,
  GAS3_CONTRACT,
  ChainType,
  DEFAULT_NEO2_ASSETS,
  DEFAULT_NEO3_ASSETS,
} from '@popup/_lib';
import BigNumber from 'bignumber.js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { handleNeo3StackNumberValue } from '../../utils/neo';
import { NeoAssetInfoState } from '../../states/neo-asset-info.state';
import { EvmAssetService } from '../evm/asset.service';

@Injectable()
export class NeoAssetService {
  private chainType: ChainType;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  private neoXNetwork: RpcNetwork;

  constructor(
    private http: HttpService,
    private chrome: ChromeService,
    private store: Store<AppState>,
    private neoAssetInfoState: NeoAssetInfoState,
    private evmAssetService: EvmAssetService
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
  }

  async searchAsset(q: string): Promise<Asset> {
    if (this.chainType === 'NeoX') {
      return this.evmAssetService.searchNeoXAsset(q);
    }
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getcontractstate',
      params: [q],
    };
    const isN3 = this.chainType === 'Neo3';
    const rpcUrl = isN3 ? this.n3Network.rpcUrl : this.n2Network.rpcUrl;
    return Promise.all([
      this.http.rpcPost(rpcUrl, data).toPromise(),
      this.neoAssetInfoState.getAssetSymbols([q], this.chainType),
      this.neoAssetInfoState.getAssetDecimals([q], this.chainType),
    ]).then(([res, symbols, decimals]) => {
      if (res && symbols[0]) {
        const asset: Asset = {
          name: isN3 ? res?.manifest?.name : res?.name,
          asset_id: res?.hash,
          symbol: symbols[0],
          decimals: decimals[0],
        };
        return asset;
      }
      return null;
    });
  }

  getNeo2Utxo(address: string, assetId: string): Observable<UTXO[]> {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getunspents',
      params: [address],
    };
    const rpcUrl = this.n2Network.rpcUrl;
    return this.http.rpcPost(rpcUrl, data).pipe(
      map((res) => {
        if (assetId.includes(res.balance?.[0]?.asset_hash)) {
          return res.balance[0].unspent.map(({ n, value, txid }) => ({
            n,
            txid,
            value,
            asset_id: res.balance[0].asset_hash,
          }));
        }
        if (assetId.includes(res.balance?.[1]?.asset_hash)) {
          return res.balance[1].unspent.map(({ n, value, txid }) => ({
            n,
            txid,
            value,
            asset_id: res.balance[1].asset_hash,
          }));
        }
      })
    );
  }

  async getAssetDetail(address: string, assetId: string): Promise<Asset> {
    const balance = await this.getAddressBalances(address);
    let asset = balance.find((e) =>
      assetId.toLowerCase().includes(e.asset_id.toLowerCase())
    );
    if (asset) return asset;
    let networkId: number;
    switch (this.chainType) {
      case 'Neo2':
        networkId = this.n2Network.id;
        break;
      case 'Neo3':
        networkId = this.n3Network.id;
        break;
      case 'NeoX':
        networkId = this.neoXNetwork.id;
        break;
    }
    const watching = await this.chrome
      .getWatch(`${this.chainType}-${networkId}`, address)
      .toPromise();
    return watching.find((w) =>
      assetId.toLowerCase().includes(w.asset_id.toLowerCase())
    );
  }

  async getAddressBalances(
    address: string,
    chain?: ChainType
  ): Promise<Asset[]> {
    if (chain === 'Neo3' || this.chainType === 'Neo3') {
      return this.getN3AddressBalances(address);
    }
    if (chain === 'Neo2' || this.chainType === 'Neo2') {
      return this.getNeo2AddressBalances(address);
    }
    return this.evmAssetService.getNeoXAddressBalances(address);
  }

  async getAddressAssetBalance(
    address: string,
    assetId: string,
    chainType: ChainType
  ) {
    if (chainType === 'NeoX') {
      return this.evmAssetService.getNeoXAddressAssetBalance(address, assetId);
    }
    if (chainType === 'Neo2' && (assetId === NEO || assetId === GAS)) {
      const nativeData = {
        jsonrpc: '2.0',
        method: 'getaccountstate',
        params: [address],
        id: 1,
      };
      const nativeRes = await this.http
        .rpcPost(this.n2Network.rpcUrl, nativeData)
        .toPromise();
      const nativeTarget = this.handleNeo2NativeBalanceResponse(nativeRes);
      const targetBalance =
        assetId === NEO
          ? nativeTarget[0].balance
          : new BigNumber(nativeTarget[1].balance).shiftedBy(8).toFixed();
      return targetBalance;
    }
    const addressHash =
      chainType === 'Neo2'
        ? wallet2.getScriptHashFromAddress(address)
        : wallet3.getScriptHashFromAddress(address);
    const data = {
      jsonrpc: '2.0',
      method: 'invokefunction',
      params: [assetId, 'balanceOf', [{ type: 'Hash160', value: addressHash }]],
      id: 1,
    };
    const rpcUrl =
      chainType === 'Neo2' ? this.n2Network.rpcUrl : this.n3Network.rpcUrl;
    const balanceRes = await this.http.rpcPost(rpcUrl, data).toPromise();
    return handleNeo3StackNumberValue(balanceRes);
  }

  //#region private function
  private async getNeo2AddressBalances(address: string): Promise<Asset[]> {
    const data = {
      jsonrpc: '2.0',
      method: 'getnep5balances',
      params: [address],
      id: 1,
    };
    const nativeRes = await this.http
      .rpcPost(this.n2Network.rpcUrl, {
        ...data,
        method: 'getaccountstate',
      })
      .toPromise();
    const nep5Res = await this.http
      .rpcPost(this.n2Network.rpcUrl, data)
      .toPromise();
    const nativeTarget = this.handleNeo2NativeBalanceResponse(nativeRes);
    const nep5Target = await this.handleNeo2BalancesResponse(nep5Res);
    return nativeTarget.concat(nep5Target);
  }
  private async getN3AddressBalances(address: string): Promise<Asset[]> {
    const data = {
      jsonrpc: '2.0',
      method: 'getnep17balances',
      params: [address],
      id: 1,
    };
    const n3Res = await this.http
      .rpcPost(this.n3Network.rpcUrl, data)
      .toPromise();
    return this.handleN3BalancesResponse(n3Res);
  }
  private handleNeo2NativeBalanceResponse(data) {
    const target = [
      { ...DEFAULT_NEO2_ASSETS.NEO },
      { ...DEFAULT_NEO2_ASSETS.GAS },
    ];
    (data?.balances || []).forEach((item) => {
      if (item.asset === NEO) {
        target[0].balance = item.value;
      }
      if (item.asset === GAS) {
        target[1].balance = item.value;
      }
    });
    return target;
  }
  private async handleNeo2BalancesResponse(data): Promise<Asset[]> {
    const result: Asset[] = [];
    const contracts = [];
    (data?.balance || []).forEach(({ amount, asset_hash }) => {
      contracts.push(asset_hash);
      result.push({
        balance: amount,
        asset_id: asset_hash,
      });
    });
    const symbols = await this.neoAssetInfoState.getAssetSymbols(
      contracts,
      'Neo2'
    );
    const decimals = await this.neoAssetInfoState.getAssetDecimals(
      contracts,
      'Neo2'
    );
    result.forEach((item, index) => {
      result[index].symbol = symbols[index];
      result[index].decimals = decimals[index];
      result[index].balance = new BigNumber(result[index].balance)
        .shiftedBy(-decimals[index])
        .toFixed();
    });
    return result;
  }
  private async handleN3BalancesResponse(data): Promise<Asset[]> {
    const result: Asset[] = [
      { ...DEFAULT_NEO3_ASSETS.NEO },
      { ...DEFAULT_NEO3_ASSETS.GAS },
    ];
    (data?.balance || []).forEach(({ amount, assethash, symbol, decimals }) => {
      if (assethash === NEO3_CONTRACT) {
        result[0].balance = amount;
      } else if (assethash === GAS3_CONTRACT) {
        result[1].balance = new BigNumber(amount)
          .shiftedBy(-decimals)
          .toFixed();
      } else {
        const assetItem: Asset = {
          balance: new BigNumber(amount).shiftedBy(-decimals).toFixed(),
          asset_id: assethash,
          symbol,
          decimals,
        };
        result.push(assetItem);
      }
    });
    return result;
  }
  //#endregion
}
