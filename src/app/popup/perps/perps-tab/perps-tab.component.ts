import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import BigNumber from 'bignumber.js';
import { Unsubscribable } from 'rxjs';

import { AppState } from '@/app/reduers';
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
import { PerpsAccountStateService } from '@/app/core/services/perps/perps-account-state.service';
import {
  PerpsAccountAvailability,
  PerpsAggregatedAccount,
  PerpsConnectionState,
  PerpsMarket,
  PerpsPosition,
} from '@popup/_lib/perps';
import { findMarketByKey, formatPositionSize } from '../perps.util';

/**
 * 首页上的永续合约 tab：账户摘要、持仓和市场列表。
 * 只对 NeoX 钱包渲染 —— Hyperliquid 的密钥是 secp256k1。
 */
@Component({
  selector: 'app-perps',
  templateUrl: 'perps-tab.component.html',
  styleUrls: ['perps-tab.component.scss'],
})
export class PerpsTabComponent implements OnInit, OnDestroy {
  address: string;
  accountLoadError = false;
  accountAvailability: PerpsAccountAvailability = 'loading';

  account: PerpsAggregatedAccount;
  /** 只用来按各仓位自己市场的精度格式化数量，与「过期」横幅共用同一条订阅。 */
  markets: PerpsMarket[] = [];

  /** 数据源健康度，以横幅呈现，并把所有报价值调暗。 */
  connectionState: PerpsConnectionState = 'connecting';
  marketFeedAt: number | null = null;

  private accountSub: Unsubscribable;
  private accountStateSub: Unsubscribable;
  private connectionSub: Unsubscribable;
  private feedAtSub: Unsubscribable;

  constructor(
    private router: Router,
    private store: Store<AppState>,
    private markets$: PerpsMarketDatasetService,
    private accountStates: PerpsAccountStateService,
    private channel: PerpsDataChannel
  ) {}

  ngOnInit() {
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      if (address && address !== this.address) {
        this.address = address;
        this.account = undefined;
        this.accountAvailability = 'loading';
        this.watchAccountState(address);
      }
    });

    this.watchFeedHealth();
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.accountStateSub?.unsubscribe();
    this.connectionSub?.unsubscribe();
    this.feedAtSub?.unsubscribe();
  }

  /**
   * 跟踪共享数据源的健康度，供已有的「过期」横幅使用，顺带取到市场数组。
   *
   * 市场是从这条订阅里读的，而不是让内嵌的列表转发一次：ADR-0008 之后 `PerpsDataset`
   * 会共享在飞的请求，并且带 15s 的快照 TTL，多一个订阅者不再多一次 `/info`。
   */
  private watchFeedHealth() {
    this.feedAtSub = this.markets$.watchMarkets().subscribe((state) => {
      this.marketFeedAt = state.updatedAt;
      this.markets = state.markets;
    });
    this.connectionSub = this.channel
      .watchConnectionState()
      .subscribe((state) => {
        this.connectionState = state;
      });
  }

  /** 消费账户领域状态，不必知道它底下是 REST 还是 WS 实现。 */
  private watchAccountState(address: string) {
    this.accountStateSub?.unsubscribe();
    this.accountLoadError = false;
    this.accountStateSub = this.accountStates
      .watchAggregatedAccount(address)
      .subscribe((state) => {
        if (address !== this.address) {
          return;
        }
        this.account = state.account ?? undefined;
        this.accountAvailability = state.availability;
        this.accountLoadError = state.availability === 'unavailable';
      });
  }

  /** 当前账户模式下的抵押品权益。 */
  get accountEquityExact(): string | null {
    if (this.unsupportedAccountMode) {
      return null;
    }
    return this.account?.totalBalanceExact ?? null;
  }

  /**
   * 究竟有没有任何权益。模板问不了一个十进制字符串这个问题 —— `'0'` 是真值 ——
   * 所以改在这里回答。
   */
  get hasEquity(): boolean {
    return (
      this.accountEquityExact !== null &&
      new BigNumber(this.accountEquityExact).isGreaterThan(0)
    );
  }

  /** 购买力；只有统一账户/组合保证金模式才会把空闲的现货 USDC 折算进来。 */
  get availableMarginExact(): string | null {
    if (this.unsupportedAccountMode) {
      return null;
    }
    return this.account?.availableBalanceExact ?? null;
  }

  /**
   * 已占用的起始保证金，由永续清算所上报。
   *
   * 账户还没到之前它是未知的，于是和同一行里的可用保证金一样返回 `null` —— 否则那行会
   * 读作「可用 -- · 已用 $0」，一半承认不知道，另一半却装作权威。
   */
  get usedMarginExact(): string | null {
    return this.account?.totalMarginUsedExact ?? null;
  }

  get marginRatioExact(): string | null {
    return this.account?.marginRatioExact ?? null;
  }

  /**
   * 上面那个保证金率描述的是哪个资金池。只要不是标准永续那个就显示出来，因为如果用户
   * 分不清是自己哪个独立清算的池子处在 25%，「25%」就毫无意义。
   */
  get marginRatioDex(): string {
    return this.account?.marginRatioDex || '';
  }

  /**
   * 有某个 DEX 没有上报，所以这些总额只覆盖了账户的一部分。数字继续留在屏幕上 ——
   * 对那些确实上报了的池子来说它们是真的 —— 但绝不能把它们当成全貌来呈现。
   */
  get aggregateIncomplete(): boolean {
    return (this.account?.missingDexes?.length || 0) > 0;
  }

  /**
   * 会花掉或挪动账户级总额的操作。对确实上报了的 DEX 上的仓位做减仓或平仓仍然可用：
   * 堵死离场比显示一个不完整的余额更糟。
   */
  get globalActionsDisabled(): boolean {
    return (
      !this.account ||
      this.accountAvailability === 'loading' ||
      this.unsupportedAccountMode ||
      this.aggregateIncomplete
    );
  }

  /**
   * 标准账户下放在永续之外的现货 USDC：余额是真的，但在被挪进永续之前它撑不起仓位，
   * 而 NeoLine 不做这件事。所以它单独展示，而不是去抬高上面的永续权益。
   */
  get separateSpotUsdcExact(): string {
    return this.account && !this.account.unified
      ? this.account.spotUsdcExact ?? '0'
      : '0';
  }

  get hasSeparateSpotUsdc(): boolean {
    return new BigNumber(this.separateSpotUsdcExact).isGreaterThan(0);
  }

  /** 屏幕上的数值是最后已知值，而不是实时值。 */
  get feedStale(): boolean {
    return this.connectionState === 'stale';
  }

  /** 最新一帧行情是多久以前到的，供「过期」横幅使用。 */
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

  /** 仓位对应的市场，按市场主键定位，好让 HIP-3 上的同名资产保持区分。 */
  marketFor(position: PerpsPosition): PerpsMarket {
    return findMarketByKey(this.markets, position.key);
  }

  /**
   * 所有账户模式都会上报仓位，包括账户级数字并不上报的组合保证金账户。在那里把仓位藏
   * 起来，等于连它们上面的平仓按钮一起藏了 —— 而平仓恰恰是绝不能取决于「我们能不能给
   * 这个账户估值」的那个动作。
   */
  get hasPositions(): boolean {
    return (this.account?.positions?.length || 0) > 0;
  }

  get unsupportedAccountMode(): boolean {
    return this.account?.abstractionMode === 'portfolioMargin';
  }

  /**
   * 按仓位所属市场的最小变动单位精度格式化的仓位数量。按市场主键定位，而不是按符号：
   * 同一个符号可能同时存在于标准永续 DEX 和某个 HIP-3 DEX 上，且精度不同。市场与账户
   * 是分开到达的，所以遇到未知市场时退回按数量级取精度，而不是什么都不显示。
   */
  positionSize(position: PerpsPosition): string {
    return formatPositionSize(
      position.sziExact,
      this.marketFor(position)?.szDecimals
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
