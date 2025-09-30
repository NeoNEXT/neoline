import { Injectable } from '@angular/core';
import { HttpService } from '../../services/http.service';
import { ChromeService } from '../../services/chrome.service';
import { AssetEVMState } from '../evm/asset.state';
import { Observable, from, of, forkJoin, firstValueFrom } from 'rxjs';
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
  DEFAULT_NEO3_ASSETS,
  NetworkType,
} from '@popup/_lib';
import BigNumber from 'bignumber.js';
import { wallet as wallet3, u } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ethers } from 'ethers';
import { SettingState } from '../setting.state';
import { environment } from '@/environments/environment';
import { handleNeo3StackNumberValue } from '../../utils/neo';
import { NeoAssetInfoState } from './asset-info.state';

interface CoinRatesItem {
  rates: { [assetId: string]: string };
  time: number;
}

const initCoinRates: Record<ChainType | 'fiat', CoinRatesItem> = {
  Neo2: { rates: {}, time: undefined },
  Neo3: { rates: {}, time: undefined },
  NeoX: { rates: {}, time: undefined },
  fiat: { rates: {}, time: undefined },
};

@Injectable()
export class AssetState {
  private apiDomain: string;
  private coinRatesV2 = JSON.parse(JSON.stringify(initCoinRates));
  private rateCurrency: string;

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
    private chrome: ChromeService,
    private assetEVMState: AssetEVMState,
    private setting: SettingState,
    private store: Store<AppState>,
    private neoAssetInfoState: NeoAssetInfoState
  ) {
    this.apiDomain = environment.mainApiBase;
    this.setting.rateCurrencySub.subscribe((res) => {
      this.rateCurrency = res;
    });
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
  }

  clearCache() {
    this.coinRatesV2 = JSON.parse(JSON.stringify(initCoinRates));
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
  private getFiatRate(): Observable<any> {
    return this.http.get(`${this.apiDomain}/v1/fiat/rates`);
  }

  private getRatesV2(chainType: ChainType) {
    switch (chainType) {
      case 'Neo2':
      case 'Neo3':
        const chain = chainType === 'Neo3' ? 'neo3' : 'neo';
        return this.http.get(`${this.apiDomain}/v2/coin/rates?chain=${chain}`);
      case 'NeoX':
        return this.http.get(`${this.apiDomain}/v1/evm/rates`);
    }
  }

  public async getAssetRateV2(
    chainType: ChainType,
    assetId: string,
    chainId?: number
  ): Promise<BigNumber> {
    if (
      (chainType === 'Neo3' &&
        this.n3Network.network !== NetworkType.N3MainNet) ||
      (chainType === 'Neo2' && this.n2Network.network !== NetworkType.MainNet)
    ) {
      return undefined;
    }
    const time = new Date().getTime() / 1000;
    if (
      !this.coinRatesV2[chainType].time ||
      this.coinRatesV2[chainType].time - time > 300 // 5 min
    ) {
      this.coinRatesV2[chainType].rates = await firstValueFrom(
        this.getRatesV2(chainType)
      );
      this.coinRatesV2[chainType].time = time;
    }
    if (!this.coinRatesV2.fiat.time) {
      const fiatResponse = await firstValueFrom(this.getFiatRate());
      this.coinRatesV2.fiat.rates = fiatResponse.rates;
      this.coinRatesV2.fiat.time = fiatResponse.last_updated;
    }

    let price: string;
    switch (chainType) {
      case 'Neo2':
      case 'Neo3':
        assetId = assetId.startsWith('0x') ? assetId.slice(2) : assetId;
        price = this.coinRatesV2[chainType].rates?.[assetId];
        break;
      case 'NeoX':
        assetId = ethers.getAddress(assetId);
        price = this.coinRatesV2[chainType].rates?.[chainId]?.[assetId]?.price;
        break;
    }
    if (price) {
      const currency = this.rateCurrency.toUpperCase();
      const fiat = this.coinRatesV2.fiat.rates[currency];
      const rate = fiat ? new BigNumber(price).times(fiat) : undefined;
      return rate;
    }
    return undefined;
  }

  async getAssetAmountRate({
    chainType,
    assetId,
    chainId,
    amount,
  }: {
    chainType: ChainType;
    assetId: string;
    chainId?: number;
    amount: string | number;
  }) {
    const rate = await this.getAssetRateV2(chainType, assetId, chainId);
    return rate && amount ? rate.times(amount).toFixed(2) : undefined;
  }

  async getAssetAmountRateAndPrice({
    chainType,
    assetId,
    chainId,
    amount,
  }: {
    chainType: ChainType;
    assetId: string;
    chainId?: number;
    amount: string | number;
  }) {
    const price = await this.getAssetRateV2(chainType, assetId, chainId);
    return {
      price: price ? price.dp(2).toFixed() : undefined,
      rate: price && amount ? price.times(amount).dp(2).toFixed() : undefined,
    };
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
    return handleNeo3StackNumberValue(balanceRes);
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
    return this.http.get(`${this.apiDomain}/v1/neo2/fees`).pipe(
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
    return this.http.get(`${this.apiDomain}/v1/neo3/fees`).pipe(
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
    const symbols = await this.neoAssetInfoState.getAssetSymbols(contracts, 'Neo2');
    const decimals = await this.neoAssetInfoState.getAssetDecimals(contracts, 'Neo2');
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
