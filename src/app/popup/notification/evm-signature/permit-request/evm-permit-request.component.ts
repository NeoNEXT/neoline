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
import { Asset } from '@/models/models';
import {
  MessageTypes,
  TypedMessage,
} from '@metamask/eth-sig-util';
import BigNumber from 'bignumber.js';
import { Unsubscribable } from 'rxjs';
import {
  buildPermitMessageTree,
  formatPermitAmount,
  PermitMessageNode,
} from './evm-permit-message';
import { EvmPermitEntry, EvmPermitRequest } from './evm-permit-request';

interface PermitEntrySummary extends EvmPermitEntry {
  amount?: string;
  tokenSymbol: string;
  fiatAmount?: string;
}

interface PermitSummary {
  entries: PermitEntrySummary[];
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

  tabType: TabType = 'details';
  rateCurrency = 'USD';
  summary: PermitSummary;
  messageNodes: PermitMessageNode[] = [];
  hasExpiredDeadline = false;

  private rateSub: Unsubscribable;
  private assetRequests = new Map<string, Promise<Asset | null>>();

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
    this.summary = {
      entries: this.request.entries.map((entry) => ({
        ...entry,
        amount: entry.rawAmount,
        tokenSymbol: this.formatAddress(entry.tokenAddress),
      })),
      interactingName:
        this.request.type === 'permit2'
          ? 'Permit2'
          : this.formatAddress(this.request.interactingAddress),
      accountName: this.encryptWallet?.name,
    };
    this.messageNodes = buildPermitMessageTree(this.typedData, this.request);
    this.hasExpiredDeadline = this.hasNodeStatus(
      this.messageNodes,
      'expired'
    );

    this.enrichTokenMetadata();
  }

  ngOnDestroy(): void {
    this.rateSub?.unsubscribe();
  }

  get isBooleanPermit(): boolean {
    return this.request.variant === 'dai';
  }

  get descriptionKey(): string {
    if (this.isBooleanPermit) {
      return this.request.allowed
        ? 'authorizationErc20UnlimitedDescription'
        : 'authorizationErc20RevokeDescription';
    }
    return this.summary.entries.length === 1
      ? 'approveNormalTip'
      : 'authorizationErc20ApproveDescription';
  }

  get authorizationTitleKey(): string {
    return this.isBooleanPermit && this.request.allowed === false
      ? 'revokePermission'
      : 'SpendingCapRequest';
  }

  fieldLabel(label: string): string {
    return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : '';
  }

  private enrichTokenMetadata(): void {
    const tokenAddresses = Array.from(
      new Set(this.request.entries.map((entry) => entry.tokenAddress.toLowerCase()))
    );

    tokenAddresses.forEach((tokenAddress) => {
      this.getAsset(tokenAddress).then((asset) => {
        if (!asset) {
          return;
        }
        this.applyAssetToSummary(tokenAddress, asset);
        this.applyAssetToNodes(this.messageNodes, tokenAddress, asset);
      });
    });
  }

  private getAsset(tokenAddress: string): Promise<Asset | null> {
    const key = tokenAddress.toLowerCase();
    if (!this.assetRequests.has(key)) {
      this.assetRequests.set(
        key,
        this.evmAssetService.searchNeoXAsset(tokenAddress).catch(() => null)
      );
    }
    return this.assetRequests.get(key);
  }

  private applyAssetToSummary(tokenAddress: string, asset: Asset): void {
    this.summary.entries
      .filter((entry) => entry.tokenAddress.toLowerCase() === tokenAddress)
      .forEach((entry) => {
        entry.tokenSymbol = asset.symbol || entry.tokenSymbol;
        if (entry.rawAmount !== undefined && asset.decimals !== undefined) {
          entry.amount = this.trimAmount(
            formatPermitAmount(entry.rawAmount, asset.decimals)
          );
          this.getFiatAmount(entry.tokenAddress, entry.amount).then(
            (fiatAmount) => (entry.fiatAmount = fiatAmount)
          );
        }
      });

    if (this.request.type === 'permit' && asset.symbol) {
      this.summary.interactingName = asset.symbol;
    }
  }

  private applyAssetToNodes(
    nodes: PermitMessageNode[],
    tokenAddress: string,
    asset: Asset
  ): void {
    nodes.forEach((node) => {
      if (node.tokenAddress?.toLowerCase() === tokenAddress) {
        node.tokenSymbol = asset.symbol;
        if (
          node.kind === 'amount' &&
          node.rawValue !== undefined &&
          asset.decimals !== undefined
        ) {
          node.displayValue = this.trimAmount(
            formatPermitAmount(String(node.rawValue), asset.decimals)
          );
        }
      }
      if (node.children) {
        this.applyAssetToNodes(node.children, tokenAddress, asset);
      }
    });
  }

  private hasNodeStatus(
    nodes: PermitMessageNode[],
    status: 'expired'
  ): boolean {
    return nodes.some(
      (node) =>
        node.timestamp?.status === status ||
        (node.children && this.hasNodeStatus(node.children, status))
    );
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
