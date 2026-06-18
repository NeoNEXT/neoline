import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { EvmAssetService, RateState, SettingState } from '@/app/core';
import { RpcNetwork } from '@/app/popup/_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import {
  MessageTypes,
  TypedMessage,
} from '@metamask/eth-sig-util';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { Unsubscribable } from 'rxjs';
import { EvmPermitRequest } from './evm-permit-request';

interface PermitSummary {
  amount: string;
  tokenSymbol: string;
  fiatAmount?: string;
  interactingName: string;
  accountName?: string;
}

type TabType = 'details' | 'data';

@Component({
  selector: 'app-evm-permit-request',
  templateUrl: './evm-permit-request.component.html',
  styleUrls: ['./evm-permit-request.component.scss'],
})
export class PopupNoticeEvmPermitRequestComponent
  implements OnInit, OnDestroy
{
  @Input() request: EvmPermitRequest;
  @Input() typedData: TypedMessage<MessageTypes>;
  @Input() strTypedData: string;
  @Input() signAddress: string;
  @Input() locationOrigin: string;
  @Input() encryptWallet: EvmWalletJSON;
  @Input() network: RpcNetwork;
  @Output() cancelEvent = new EventEmitter<void>();
  @Output() confirmEvent = new EventEmitter<void>();

  loading = true;
  tabType: TabType = 'details';
  displayOrigin = '';
  rateCurrency = 'USD';
  summary: PermitSummary;

  private rateSub: Unsubscribable;

  constructor(
    private evmAssetService: EvmAssetService,
    private rateState: RateState,
    private settingState: SettingState
  ) {
    this.rateSub = this.settingState.rateCurrencySub.subscribe((currency) => {
      this.rateCurrency = currency || 'USD';
    });
  }

  ngOnInit(): void {
    this.displayOrigin = this.formatOrigin(this.locationOrigin);
    this.buildSummary().finally(() => {
      this.loading = false;
    });
  }

  ngOnDestroy(): void {
    this.rateSub?.unsubscribe();
  }

  private async buildSummary(): Promise<void> {
    const domain: any = this.typedData.domain;
    let tokenSymbol = domain.name || this.formatAddress(this.request.tokenAddress);
    let amount = this.request.rawAmount;
    let fiatAmount: string;

    try {
      const asset = await this.evmAssetService.searchNeoXAsset(
        this.request.tokenAddress
      );
      if (asset?.symbol) {
        tokenSymbol = asset.symbol;
      }
      if (asset?.decimals !== undefined) {
        amount = this.trimAmount(
          ethers.formatUnits(this.request.rawAmount, asset.decimals)
        );
        fiatAmount = await this.getFiatAmount(this.request.tokenAddress, amount);
      }
    } catch {
      // Raw typed-data values remain available if token metadata is unavailable.
    }

    this.summary = {
      amount,
      tokenSymbol,
      fiatAmount,
      interactingName:
        this.request.type === 'permit2' ? 'Permit2' : tokenSymbol,
      accountName: this.encryptWallet?.name,
    };
  }

  private async getFiatAmount(
    tokenAddress: string,
    amount: string
  ): Promise<string> {
    if (!this.network?.chainId) {
      return undefined;
    }
    try {
      const price = await this.rateState.getAssetRateV2(
        'NeoX',
        tokenAddress,
        this.network.chainId
      );
      const total = price?.times(amount);
      if (!total || total.isNaN() || total.isZero()) {
        return undefined;
      }
      if (total.isLessThan(0.01)) {
        return `< ${this.getCurrencySymbol(this.rateCurrency)}0.01`;
      }
      return `${this.getCurrencySymbol(this.rateCurrency)}${total
        .dp(2)
        .toFixed()}`;
    } catch {
      return undefined;
    }
  }

  private formatOrigin(origin: string): string {
    if (!origin) {
      return '';
    }
    try {
      return new URL(origin).host;
    } catch {
      return origin.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  }

  private formatAddress(address: string): string {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  }

  private trimAmount(amount: string): string {
    return new BigNumber(amount).toFixed();
  }

  private getCurrencySymbol(currency: string): string {
    switch (currency) {
      case 'CNY':
      case 'JPY':
        return '¥';
      case 'EUR':
        return '€';
      case 'KRW':
        return '₩';
      case 'USD':
      default:
        return '$';
    }
  }
}
