import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import BigNumber from 'bignumber.js';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import {
  PerpsAggregatedAccount,
  PerpsConnectionState,
  PerpsMarket,
  PerpsPosition,
} from '@popup/_lib/perps';
import {
  formatPrice,
  formatSignedPercent,
  formatSignedUsd,
  formatSize,
  formatUsd,
} from '../perps.util';

/**
 * The 永续合约 tab on the home page: account summary, open positions and the
 * market list. Only rendered for NeoX wallets — Hyperliquid keys are secp256k1.
 */
@Component({
  selector: 'app-perps',
  templateUrl: 'perps-tab.component.html',
  styleUrls: ['perps-tab.component.scss'],
})
export class PerpsTabComponent implements OnInit, OnDestroy {
  address: string;
  accountLoadError = false;

  account: PerpsAggregatedAccount;
  /**
   * Reported by the embedded market list, and used only to size positions at
   * their own market's precision — this tab does not own the market feed.
   */
  markets: PerpsMarket[] = [];

  /** Feed health, shown as a banner and by dimming every quoted value. */
  connectionState: PerpsConnectionState = 'connecting';
  marketFeedAt: number | null = null;

  private accountSub: Unsubscribable;
  private spotStateSub: Unsubscribable;
  private clearinghouseStateSubs: Unsubscribable[] = [];
  private connectionSub: Unsubscribable;
  private feedAtSub: Unsubscribable;
  private accountStateAddress: string;
  private pendingSpotState: any;
  private pendingClearinghouseState: any[] = [];
  private accountRequestId = 0;

  //#region template helpers
  formatPrice = formatPrice;
  formatUsd = formatUsd;
  formatSignedUsd = formatSignedUsd;
  formatSignedPercent = formatSignedPercent;
  //#endregion

  constructor(
    private router: Router,
    private store: Store<AppState>,
    private hyperliquid: HyperliquidService
  ) {}

  ngOnInit() {
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      if (address && address !== this.address) {
        this.address = address;
        this.account = undefined;
        this.pendingSpotState = undefined;
        this.pendingClearinghouseState = [];
        this.watchAccountState(address);
        this.loadAccount();
      }
    });

    this.watchFeedHealth();
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.spotStateSub?.unsubscribe();
    this.unwatchClearinghouseState();
    this.connectionSub?.unsubscribe();
    this.feedAtSub?.unsubscribe();
  }

  /**
   * Track feed health, and re-snapshot the account whenever the feed comes back.
   *
   * Market frames repair themselves — each one carries the whole context array,
   * so the first frame after a reconnect is already a full picture. Account
   * state does not get that guarantee from us, so it is re-fetched over REST;
   * a position opened while the socket was down would otherwise stay invisible.
   */
  private watchFeedHealth() {
    this.feedAtSub = this.hyperliquid
      .watchMarketFeedAt()
      .subscribe((at) => (this.marketFeedAt = at));
    this.connectionSub = this.hyperliquid
      .watchConnectionState()
      .subscribe((state) => {
        const recovered = this.connectionState === 'stale' && state === 'live';
        this.connectionState = state;
        if (recovered) {
          this.loadAccount();
        }
      });
  }

  private loadAccount() {
    if (!this.address) {
      return;
    }
    const requestId = ++this.accountRequestId;
    const address = this.address;
    this.accountLoadError = false;
    this.hyperliquid
      .getAggregatedAccount(address)
      .subscribe({
        next: (account) => {
          if (requestId === this.accountRequestId && address === this.address) {
            let latest = account;
            this.pendingClearinghouseState.forEach((update) => {
              latest = this.hyperliquid.updateAggregatedFromClearinghouseState(
                latest,
                update
              );
            });
            if (this.pendingSpotState) {
              latest = this.hyperliquid.updateAggregatedFromSpotState(
                latest,
                this.pendingSpotState
              );
            }
            this.pendingClearinghouseState = [];
            this.pendingSpotState = undefined;
            this.account = latest;
          }
        },
        error: () => {
          if (requestId === this.accountRequestId && address === this.address) {
            this.accountLoadError = true;
          }
        },
      });
  }

  /**
   * After the initial REST snapshot, perps and spot account changes are both
   * driven by websocket payloads without issuing another `/info` request.
   */
  private watchAccountState(address: string) {
    this.spotStateSub?.unsubscribe();
    this.unwatchClearinghouseState();
    this.accountStateAddress = address.toLowerCase();
    this.spotStateSub = this.hyperliquid
      .subscribe({ type: 'spotState', user: this.accountStateAddress })
      .subscribe((update) => {
        if (this.account) {
          this.account = this.hyperliquid.updateAggregatedFromSpotState(
            this.account,
            update
          );
        } else {
          this.pendingSpotState = update;
        }
      });
    // One subscription per DEX: each clearinghouse reports its own pool, and a
    // shared subscription would let one DEX's frame overwrite another's.
    this.clearinghouseStateSubs = this.hyperliquid.enabledDexes.map((dex) =>
      this.hyperliquid
        .subscribe({
          type: 'clearinghouseState',
          user: this.accountStateAddress,
          dex,
        })
        .subscribe((update) => {
          if (this.account) {
            this.account =
              this.hyperliquid.updateAggregatedFromClearinghouseState(
                this.account,
                update
              );
          } else {
            this.pendingClearinghouseState.push(update);
          }
        })
    );
  }

  private unwatchClearinghouseState() {
    this.clearinghouseStateSubs.forEach((sub) => sub.unsubscribe());
    this.clearinghouseStateSubs = [];
  }

  /** Collateral equity for the active account mode. */
  get accountEquityExact(): string {
    if (this.unsupportedAccountMode) {
      return '0';
    }
    return this.account?.totalBalanceExact ?? '0';
  }

  /**
   * Whether there is any equity at all. Templates cannot ask this of a decimal
   * string — `'0'` is truthy — so the question is answered here instead.
   */
  get hasEquity(): boolean {
    return new BigNumber(this.accountEquityExact).isGreaterThan(0);
  }

  /** Buying power, with free spot USDC folded only for Unified/portfolio mode. */
  get availableMarginExact(): string {
    if (this.unsupportedAccountMode) {
      return '0';
    }
    return this.account?.availableBalanceExact ?? '0';
  }

  /** Initial margin in use, reported by the perps clearinghouse. */
  get usedMarginExact(): string {
    return this.account?.totalMarginUsedExact ?? '0';
  }

  get marginRatioExact(): string | null {
    return this.account?.marginRatioExact ?? null;
  }

  /**
   * Which pool the margin ratio above describes. Shown whenever it is not the
   * canonical one, because "25%" means nothing if the user cannot tell which
   * of their independently-liquidated pools is at 25%.
   */
  get marginRatioDex(): string {
    return this.account?.marginRatioDex || '';
  }

  /**
   * Some DEX did not report, so the totals cover only part of the account.
   * The figures stay on screen — they are real for the pools that did report —
   * but they must not be presented as the whole picture.
   */
  get aggregateIncomplete(): boolean {
    return (this.account?.missingDexes?.length || 0) > 0;
  }

  /**
   * Actions that spend or move the account-wide total. Reducing or closing a
   * position on a DEX that did report stays available: blocking the exit is
   * worse than showing an incomplete balance.
   */
  get globalActionsDisabled(): boolean {
    return this.unsupportedAccountMode || this.aggregateIncomplete;
  }

  /**
   * Spot USDC held outside perps under a standard account: real balance, but it
   * cannot back a position until it is moved into perps, which NeoLine does not
   * do. It is surfaced separately rather than inflating the perps equity above.
   */
  get separateSpotUsdcExact(): string {
    return this.account && !this.account.unified
      ? this.account.spotUsdcExact ?? '0'
      : '0';
  }

  get hasSeparateSpotUsdc(): boolean {
    return new BigNumber(this.separateSpotUsdcExact).isGreaterThan(0);
  }

  /** Values on screen are last-known rather than live. */
  get feedStale(): boolean {
    return this.connectionState === 'stale';
  }

  /** How long ago the newest market frame arrived, for the stale banner. */
  get lastUpdatedLabel(): string {
    if (!this.marketFeedAt) {
      return '';
    }
    const seconds = Math.max(0, Math.round((Date.now() - this.marketFeedAt) / 1000));
    if (seconds < 60) {
      return `${seconds}s`;
    }
    return `${Math.floor(seconds / 60)}m`;
  }

  /** A position's market, located by key so HIP-3 namesakes stay distinct. */
  marketFor(position: PerpsPosition): PerpsMarket {
    return this.markets.find((item) => item.key === position.key);
  }

  /** Return on equity arrives as a fraction; the label shows a percentage. */
  returnOnEquityPercent(position: PerpsPosition): string {
    return new BigNumber(position.returnOnEquityExact).times(100).toFixed();
  }

  get hasPositions(): boolean {
    if (this.unsupportedAccountMode) {
      return false;
    }
    return (this.account?.positions?.length || 0) > 0;
  }

  get unsupportedAccountMode(): boolean {
    return this.account?.abstractionMode === 'portfolioMargin';
  }

  /**
   * A position's size at its market's lot precision. Located by market key, not
   * by symbol: the same symbol can exist on the canonical DEX and on a HIP-3 one
   * with different lot precision. The markets arrive separately from the
   * account, so an unknown market falls back to sizing by magnitude rather than
   * showing nothing.
   */
  positionSize(position: PerpsPosition): string {
    const market = this.marketFor(position);
    return formatSize(
      new BigNumber(position.sziExact).absoluteValue(),
      market?.szDecimals
    );
  }

  toMarkets() {
    this.router.navigateByUrl('/popup/perps/markets');
  }

  toFunding(tab: 'deposit' | 'withdraw') {
    if (this.unsupportedAccountMode) {
      return;
    }
    this.router.navigateByUrl(`/popup/perps/funding?tab=${tab}`);
  }

  toHistory() {
    this.router.navigateByUrl('/popup/perps/history');
  }

  addToPosition(position: PerpsPosition) {
    this.router.navigateByUrl(
      `/popup/perps/order/${position.coin}?side=${
        position.isLong ? 'long' : 'short'
      }`
    );
  }

  closePosition(position: PerpsPosition) {
    this.router.navigateByUrl(`/popup/perps/order/${position.coin}?close=1`);
  }
}
