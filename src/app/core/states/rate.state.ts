import { Injectable } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { RpcNetwork } from '@popup/_lib/type';
import { ChainType, NetworkType } from '@popup/_lib';
import BigNumber from 'bignumber.js';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ethers } from 'ethers';
import { environment } from '@/environments/environment';
import { HttpService } from '../services/http.service';
import { SettingState } from './setting.state';

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
export class RateState {
  private apiDomain: string;
  private coinRatesV2 = JSON.parse(JSON.stringify(initCoinRates));
  private rateCurrency: string;

  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;

  constructor(
    private http: HttpService,
    private setting: SettingState,
    private store: Store<AppState>
  ) {
    this.apiDomain = environment.mainApiBase;
    this.setting.rateCurrencySub.subscribe((res) => {
      this.rateCurrency = res;
    });
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
    });
  }

  clearCache() {
    this.coinRatesV2 = JSON.parse(JSON.stringify(initCoinRates));
  }

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
}
