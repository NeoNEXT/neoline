import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';
import { AssetEVMState } from './asset-evm.state';
import { Observable, from, of, forkJoin } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Asset, NEO, GAS, UTXO } from 'src/models/models';
import { map } from 'rxjs/operators';
import { GasFeeSpeed, RpcNetwork } from '@popup/_lib/type';
import { bignumber } from 'mathjs';
import { rpc, wallet as wallet2 } from '@cityofzion/neon-js';
import {
  NEO3_CONTRACT,
  GAS3_CONTRACT,
  ChainType,
  DEFAULT_NEO2_ASSETS,
  STORAGE_NAME,
  DEFAULT_NEO3_ASSETS,
  NetworkType,
} from '@popup/_lib';
import BigNumber from 'bignumber.js';
import { UtilServiceState } from '../util/util.service';
import { wallet as wallet3, u } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';

@Injectable()
export class AssetState {
  private coinRates;
  private neo3CoinRates;
  private fiatRates;
  private rateRequestTime;
  public rateCurrency: string;

  private allNeoGasFeeSpeed: { [key: string]: GasFeeSpeed } = {};
  private gasFeeDefaultSpeed: GasFeeSpeed = {
    slow_price: '0',
    propose_price: '0.011',
    fast_price: '0.2',
  };

  private chainType: ChainType;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  private neoXNetwork: RpcNetwork;
  constructor(
    private http: HttpService,
    private global: GlobalService,
    private chrome: ChromeService,
    private assetEVMState: AssetEVMState,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
    this.getLocalRate();
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
  }

  getLocalRate() {
    const getNeo2CoinsRate = this.chrome.getStorage(STORAGE_NAME.coinsRate);
    const getN3CoinsRate = this.chrome.getStorage(STORAGE_NAME.neo3CoinsRate);
    const getFiatRate = this.chrome.getStorage(STORAGE_NAME.fiatRate);
    forkJoin([getNeo2CoinsRate, getN3CoinsRate, getFiatRate]).subscribe(
      ([coinRate, neo3CoinRate, fiatRate]) => {
        this.coinRates = coinRate;
        this.neo3CoinRates = neo3CoinRate;
        this.fiatRates = fiatRate;
      }
    );
  }

  clearCache() {
    this.coinRates = undefined;
    this.neo3CoinRates = undefined;
    this.fiatRates = undefined;
    this.rateRequestTime = undefined;
  }

  //#region claim
  // neo2
  public fetchClaim(address: string): Observable<any> {
    const getClaimable = from(
      rpc.Query.getClaimable(address).execute(this.n2Network.rpcUrl)
    );
    const getUnclaimed = from(
      rpc.Query.getUnclaimed(address).execute(this.n2Network.rpcUrl)
    );
    return forkJoin([getClaimable, getUnclaimed]).pipe(
      map((res) => {
        const result = {
          available: 0,
          unavailable: 0,
          claimable: [],
        };
        const claimableData = res[0];
        const unclaimed = res[1];
        result.available = unclaimed.result.available || 0;
        result.unavailable = unclaimed.result.unavailable || 0;
        result.claimable = claimableData.result.claimable || [];
        return result;
      })
    );
  }
  //neo3
  public getUnclaimedGas(address: string): Observable<any> {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getunclaimedgas',
      params: [address],
    };
    return this.http.rpcPost(this.n3Network.rpcUrl, data);
  }
  //#endregion

  //#region rate
  public getRate(): Observable<any> {
    const chain = this.chainType === 'Neo3' ? 'neo3' : 'neo';
    return this.http.get(
      `${this.global.apiDomain}/v2/coin/rates?chain=${chain}`
    );
  }

  private getFiatRate(): Observable<any> {
    return this.http.get(`${this.global.apiDomain}/v1/fiat/rates`);
  }

  public async getAssetRate(
    symbol: string,
    assetId: string
  ): Promise<BigNumber | undefined> {
    const isNeo3 = this.chainType === 'Neo3';
    if (
      (isNeo3 && this.n3Network.network !== NetworkType.N3MainNet) ||
      (!isNeo3 && this.n2Network.network !== NetworkType.MainNet) ||
      this.chainType === 'NeoX'
    ) {
      return undefined;
    }
    const time = new Date().getTime() / 1000;
    if (
      !this.rateRequestTime ||
      (isNeo3 && JSON.stringify(this.neo3CoinRates) === '{}') ||
      (!isNeo3 && JSON.stringify(this.coinRates) === '{}') ||
      (this.rateRequestTime && time - this.rateRequestTime > 300)
    ) {
      this.rateRequestTime = time;
      const coinRateTemp = await this.getRate().toPromise();
      if (isNeo3 && coinRateTemp) {
        this.neo3CoinRates = coinRateTemp;
        this.chrome.setStorage(STORAGE_NAME.neo3CoinsRate, coinRateTemp);
      }
      if (!isNeo3 && coinRateTemp) {
        this.coinRates = coinRateTemp;
        this.chrome.setStorage(STORAGE_NAME.coinsRate, coinRateTemp);
      }
      this.fiatRates = await this.getFiatRate().toPromise();
      this.chrome.setStorage(STORAGE_NAME.fiatRate, this.fiatRates);
    }
    assetId = assetId.startsWith('0x') ? assetId.slice(2) : assetId;
    let price;
    if (isNeo3 && this.neo3CoinRates[assetId]) {
      price = this.neo3CoinRates[assetId];
    }
    if (!isNeo3 && this.coinRates[assetId]) {
      price = this.coinRates[assetId];
    }
    if (price) {
      const currency = this.rateCurrency.toUpperCase();
      const fiat =
        this.fiatRates.rates[currency] && this.fiatRates.rates[currency];
      const rate =
        price && fiat
          ? new BigNumber(price).times(new BigNumber(fiat))
          : undefined;
      return rate;
    }
    return undefined;
  }
  //#endregion

  //#region other
  async searchAsset(q: string): Promise<Asset> {
    if (this.chainType === 'NeoX') {
      return this.assetEVMState.searchNeoXAsset(q);
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
      this.util.getAssetSymbols([q], this.chainType),
      this.util.getAssetDecimals([q], this.chainType),
    ]).then(([res, symbols, decimals]) => {
      const asset: Asset = {
        name: isN3 ? res?.manifest?.name : res?.name,
        asset_id: res?.hash,
        symbol: symbols[0],
        decimals: decimals[0],
      };
      return asset;
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
        if (assetId.includes(res.balance[0].asset_hash)) {
          return res.balance[0].unspent.map(({ n, value, txid }) => ({
            n,
            txid,
            value,
            asset_id: res.balance[0].asset_hash,
          }));
        }
        if (assetId.includes(res.balance[1].asset_hash)) {
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
    let asset = balance.find((e) => e.asset_id === assetId);
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
    return watching.find((w) => w.asset_id === assetId);
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
    return this.assetEVMState.getNeoXAddressBalances(address);
  }

  async getAddressAssetBalance(
    address: string,
    assetId: string,
    chainType: ChainType
  ) {
    if (chainType === 'NeoX') {
      return this.assetEVMState.getNeoXAddressAssetBalance(address, assetId);
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
    return this.util.handleNeo3StackNumberValue(balanceRes);
  }
  //#endregion

  //#region gas fee
  getGasFee(): Observable<GasFeeSpeed> {
    if (this.chainType === 'NeoX') return of(null);
    if (this.chainType === 'Neo3') {
      if (this.allNeoGasFeeSpeed[this.n3Network.network]) {
        return of(this.allNeoGasFeeSpeed[this.n3Network.network]);
      }
      return this.fetchNeo3GasFee();
    }
    if (this.allNeoGasFeeSpeed[this.n2Network.network]) {
      return of(this.allNeoGasFeeSpeed[this.n2Network.network]);
    }
    return this.http.get(`${this.global.apiDomain}/v1/neo2/fees`).pipe(
      map((res: any) => {
        if (res) {
          this.allNeoGasFeeSpeed[this.n2Network.network] = res;
        }
        return res || this.gasFeeDefaultSpeed;
      }),
      catchError(() => of(this.gasFeeDefaultSpeed))
    );
  }

  private fetchNeo3GasFee(): Observable<any> {
    return this.http.get(`${this.global.apiDomain}/v1/neo3/fees`).pipe(
      map((res: any) => {
        if (res) {
          res.slow_price = bignumber(res.slow_price)
            .dividedBy(bignumber(10).pow(8))
            .toFixed();
          res.propose_price = bignumber(res.propose_price)
            .dividedBy(bignumber(10).pow(8))
            .toFixed();
          res.fast_price = bignumber(res.fast_price)
            .dividedBy(bignumber(10).pow(8))
            .toFixed();
          this.allNeoGasFeeSpeed[this.n3Network.network] = res;
        }
        return res || this.gasFeeDefaultSpeed;
      }),
      catchError(() => of(this.gasFeeDefaultSpeed))
    );
  }
  //#endregion

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
    const symbols = await this.util.getAssetSymbols(contracts, 'Neo2');
    const decimals = await this.util.getAssetDecimals(contracts, 'Neo2');
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
