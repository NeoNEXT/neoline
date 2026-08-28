import { Component, OnDestroy, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import BigNumber from 'bignumber.js';
import { forkJoin, Observable, of, Subscription, Unsubscribable } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { PerpsExchangeWriteService } from '@app/core/services/perps/perps-exchange-write.service';
import { PerpsMarketDatasetService } from '@app/core/services/perps/perps-market-dataset.service';
import { PerpsDataChannel } from '@app/core/services/perps/perps-data-channel.service';
import { EvmWalletJSON } from '@popup/_lib/evm';
import {
  PerpsFill,
  PerpsHistoricalOrder,
  PerpsLedgerUpdate,
  PerpsMarket,
  PerpsOpenOrder,
} from '@popup/_lib/perps';
import {
  formatFillTime,
  formatPrice,
  formatSignedUsd,
  formatSize,
} from '../perps.util';

type PerpsActivityTab =
  | 'orders'
  | 'fills'
  | 'orderHistory'
  | 'transfers';

/**
 * 有友好文案的订单状态。Hyperliquid 还有一长串 `xxxCanceled` / `xxxRejected` 变体，
 * 在 orderStatusKey 里按后缀统一处理。
 */
const ORDER_STATUS_LABELS = {
  filled: 'perpsStatusFilled',
  open: 'perpsStatusOpen',
  canceled: 'perpsStatusCanceled',
  scheduledCancel: 'perpsStatusCanceled',
  rejected: 'perpsStatusRejected',
  triggered: 'perpsStatusTriggered',
};

/**
 * Hyperliquid 自己的活动表格命名的是「动作」而不是账本原语，这份列表跟着它来：Arbitrum
 * 跨桥读作入金或出金，它的点对点 USDC 操作按本钱包处在哪一端读作转出或转入，而在现货与
 * 永续余额之间挪动抵押品读作划转。
 */
const LEDGER_TYPE_LABELS = {
  deposit: 'perpsLedgerDeposit',
  withdraw: 'perpsLedgerWithdraw',
  internalTransfer: 'perpsLedgerSend',
  accountClassTransfer: 'perpsLedgerTransfer',
  subAccountTransfer: 'perpsLedgerTransfer',
};

/**
 * 现货转账没有固定文案。HyperEVM 或跨桥转账正是以它的形式落地的，所以 Hyperliquid 按钱
 * 的流向来命名：转入读作入金，转出读作出金。
 */
const DIRECTIONAL_LEDGER_TYPES = ['send', 'spotTransfer'];

/** 弹窗最多也就能滚这么长；更早的行留给网页端去看。 */
const MAX_ARCHIVE_ROWS = 200;

@Component({
  templateUrl: 'perps-history.component.html',
  styleUrls: ['perps-history.component.scss'],
})
export class PerpsHistoryComponent implements OnInit, OnDestroy {
  fills: PerpsFill[] = [];
  openOrders: PerpsOpenOrder[] = [];
  historicalOrders: PerpsHistoricalOrder[] = [];
  transfers: PerpsLedgerUpdate[] = [];
  tab: PerpsActivityTab = 'orders';
  loading = true;
  /** 两个按需拉取的 tab 各自的加载指示。 */
  tabLoading = false;
  loadError = false;
  pendingCancelOrderId: string;
  cancelingOrderId: string;

  formatPrice = formatPrice;
  formatSignedUsd = formatSignedUsd;

  private address: string;
  private wallet: EvmWalletJSON;
  private markets: PerpsMarket[] = [];
  private accountSub: Unsubscribable;
  private liveSubs = new Subscription();
  /** 当前地址下已经拉取过的 tab。 */
  private loadedTabs = new Set<PerpsActivityTab>();
  /** 有请求在途的 tab，这样来回切换也只会发一次。 */
  private pendingTabs = new Set<PerpsActivityTab>();

  constructor(
    private store: Store<AppState>,
    private hyperliquid: HyperliquidService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService,
    private global: GlobalService,
    private channel: PerpsDataChannel,
    private markets$: PerpsMarketDatasetService,
    private writes: PerpsExchangeWriteService
  ) {}

  ngOnInit() {
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      this.wallet = state.currentWallet as EvmWalletJSON;
      if (address && address !== this.address) {
        this.address = address;
        this.load();
      }
    });
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.liveSubs.unsubscribe();
  }

  private load() {
    this.loading = true;
    this.loadError = false;
    this.loadedTabs.clear();
    this.pendingTabs.clear();
    this.historicalOrders = [];
    this.transfers = [];
    forkJoin([
      this.hyperliquid.getOpenOrders(this.address),
      // 市场数据只用于解析取消操作所需的资产 id。一次被限流或失败的市场快照，
      // 不该把那些加载正常的订单藏起来。
      this.markets$.getMarkets().pipe(catchError(() => of([]))),
    ]).subscribe(
      ([openOrders, markets]) => {
        this.openOrders = openOrders;
        // `userFills` 会立刻推送一条 `isSnapshot` 的 websocket 消息。
        // 不要再先花一次带权重的 REST 请求去取同样的历史。
        this.fills = [];
        this.markets = markets;
        this.loadedTabs.add('orders');
        this.loading = false;
        this.watchLiveActivity();
        this.loadTab(this.tab);
      },
      () => {
        this.loading = false;
        this.loadError = true;
      }
    );
  }

  /** 两个归档 tab 只有在用户真正打开时才值得发一次请求。 */
  private loadTab(tab: PerpsActivityTab) {
    if (tab === 'orders' || tab === 'fills') {
      return;
    }
    if (
      this.loading ||
      this.loadedTabs.has(tab) ||
      this.pendingTabs.has(tab) ||
      !this.address
    ) {
      return;
    }
    this.pendingTabs.add(tab);
    const request: Observable<any[]> = tab === 'orderHistory'
      ? this.hyperliquid.getHistoricalOrders(this.address)
      : this.hyperliquid.getLedgerUpdates(this.address);
    this.tabLoading = true;
    request.subscribe((res: any[]) => {
      if (tab === 'orderHistory') {
        // 每次状态变化一行，与 Hyperliquid 自己的订单历史渲染方式完全一致：一笔先挂单
        // 后成交的订单会出现两次。排序是稳定的，因此时间戳相同的行保持 API 那种
        // 「最新状态在前」的顺序。
        this.historicalOrders = (res as PerpsHistoricalOrder[])
          .slice()
          .sort((a, b) => b.statusTimestamp - a.statusTimestamp)
          .slice(0, MAX_ARCHIVE_ROWS);
      } else {
        this.transfers = (res as PerpsLedgerUpdate[])
          .slice()
          .sort((a, b) => b.time - a.time)
          .slice(0, MAX_ARCHIVE_ROWS);
      }
      this.pendingTabs.delete(tab);
      this.loadedTabs.add(tab);
      if (this.tab === tab) {
        this.tabLoading = false;
      }
    }, () => {
      this.pendingTabs.delete(tab);
      this.tabLoading = false;
      this.loadError = true;
    });
  }

  private watchLiveActivity() {
    this.liveSubs.unsubscribe();
    this.liveSubs = new Subscription();
    this.liveSubs.add(
      this.hyperliquid.watchOpenOrders(this.address).subscribe({
        next: (orders) => (this.openOrders = orders),
        error: () => (this.loadError = true),
      })
    );
    this.liveSubs.add(
      this.channel
        .subscribe({ type: 'userFills', user: this.address.toLowerCase() })
        .subscribe({
          next: (update) => {
            const incoming: PerpsFill[] = update?.fills || [];
            this.fills = update?.isSnapshot
              ? incoming
              : this.mergeFills(incoming, this.fills);
            if (update?.isSnapshot) {
              this.loadedTabs.add('fills');
              if (this.tab === 'fills') {
                this.tabLoading = false;
              }
            }
          },
          error: () => (this.loadError = true),
        })
    );
  }

  private mergeFills(incoming: PerpsFill[], current: PerpsFill[]): PerpsFill[] {
    const seen = new Set<string>();
    return [...incoming, ...current]
      .filter((fill) => {
        const key = `${fill.tid ?? ''}:${fill.oid ?? ''}:${fill.time}:${fill.px}:${fill.sz}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.time - a.time);
  }

  setTab(tab: PerpsActivityTab) {
    this.tab = tab;
    this.pendingCancelOrderId = undefined;
    this.tabLoading = !this.loading && !this.loadedTabs.has(tab);
    this.loadTab(tab);
  }

  requestCancel(order: PerpsOpenOrder) {
    if (this.pendingCancelOrderId === order.oid) {
      this.cancel(order);
      return;
    }
    this.pendingCancelOrderId = order.oid;
  }

  private async cancel(order: PerpsOpenOrder) {
    if (this.cancelingOrderId) {
      return;
    }
    if (
      this.wallet?.accounts[0]?.extra?.ledgerSLIP44 ||
      this.wallet?.accounts[0]?.extra?.qrBasedXFP
    ) {
      this.global.snackBarTip('perpsSigningUnavailable');
      return;
    }
    const market = this.markets.find((item) => item.coin === order.coin);
    if (!market) {
      this.global.snackBarTip('txFailed', 'Unknown perpetual market');
      return;
    }
    this.cancelingOrderId = order.oid;
    try {
      const password = await this.chrome.getPassword();
      const privateKey = await this.evmWallet.getPrivateKey(
        this.wallet,
        password
      );
      this.writes
        .cancelOrder(privateKey, market.assetId, order.oid)
        .subscribe({
          next: () => {
            this.cancelingOrderId = undefined;
            this.pendingCancelOrderId = undefined;
            this.openOrders = this.openOrders.filter(
              (item) => item.oid !== order.oid
            );
            // 被取消的订单现在归属归档 tab。
            this.loadedTabs.delete('orderHistory');
            this.global.snackBarTip('perpsOrderCanceled');
          },
          error: (error) => {
            this.cancelingOrderId = undefined;
            this.global.snackBarTip('txFailed', error?.message || error);
          },
        });
    } catch (error) {
      this.cancelingOrderId = undefined;
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  isBuy(fill: PerpsFill): boolean {
    return fill.side === 'B';
  }

  orderIsBuy(order: PerpsOpenOrder): boolean {
    return order.side === 'B';
  }

  /** 把 Hyperliquid 的方向和 reduce-only 标记翻译成交易意图。 */
  orderDirectionKey(
    order: PerpsOpenOrder
  ): 'perpsOpenLong' | 'perpsOpenShort' | 'perpsCloseLong' | 'perpsCloseShort' {
    if (order.reduceOnly) {
      return this.orderIsBuy(order) ? 'perpsCloseShort' : 'perpsCloseLong';
    }
    return this.orderIsBuy(order) ? 'perpsOpenLong' : 'perpsOpenShort';
  }

  orderIsPositionTpsl(order: PerpsOpenOrder): boolean {
    return !!order.isPositionTpsl;
  }

  fillTime(fill: PerpsFill): string {
    return formatFillTime(fill.time);
  }

  time(timestamp: number): string {
    return formatFillTime(timestamp);
  }

  /**
   * 按所属市场的最小变动单位精度格式化的订单或成交数量。历史会跨越本钱包可能已经不再
   * 持有的市场，所以未知币种按数量级取精度。
   */
  size(value: string | number, coin: string): string {
    const market = this.markets.find((item) => item.coin === coin);
    return formatSize(value, market?.szDecimals);
  }

  /** 订单状态的 i18n key；需要显示原始值时返回 ''。 */
  orderStatusKey(status: string): string {
    if (ORDER_STATUS_LABELS[status]) {
      return ORDER_STATUS_LABELS[status];
    }
    if (status?.endsWith('Canceled')) {
      return 'perpsStatusCanceled';
    }
    if (status?.endsWith('Rejected')) {
      return 'perpsStatusRejected';
    }
    return '';
  }

  /** 账本行的 i18n key；遇到冷门类型（vault、staking 等）时返回 ''。 */
  ledgerTypeKey(update: PerpsLedgerUpdate): string {
    const type = update.delta?.type;
    if (DIRECTIONAL_LEDGER_TYPES.indexOf(type) > -1) {
      return this.ledgerIsOut(update)
        ? 'perpsLedgerWithdraw'
        : 'perpsLedgerDeposit';
    }
    return LEDGER_TYPE_LABELS[type] || '';
  }

  ledgerIsOut(update: PerpsLedgerUpdate): boolean {
    const delta = update.delta || ({} as any);
    if (delta.type === 'withdraw') {
      return true;
    }
    // class transfer 落到现货那一侧时，意味着抵押品被移出了永续账户。
    if (delta.type === 'accountClassTransfer') {
      return delta.toPerp === false;
    }
    // 点对点的行同时带着双方：除非钱落到了本地址上，否则我们就是发送方。
    if (delta.destination) {
      return delta.destination.toLowerCase() !== this.address?.toLowerCase();
    }
    return false;
  }

  /** 账本金额在跨桥/class 行里是 USDC，其余情况以对应代币计价。 */
  ledgerAmount(update: PerpsLedgerUpdate): string {
    const delta = update.delta || ({} as any);
    const value = delta.usdc ?? delta.amount;
    if (value === undefined) {
      return '';
    }
    const token = delta.usdc !== undefined ? 'USDC' : delta.token || '';
    return `${this.ledgerIsOut(update) ? '-' : '+'}${value} ${token}`.trim();
  }

  /**
   * 一条账本行额外收取的手续费；不收时返回 ''。协议报告为零的手续费就是「没有手续费」：
   * 它不出现在这一行上，而不是显示成一笔金额为零的收费。
   */
  ledgerFee(update: PerpsLedgerUpdate): string {
    const delta = update.delta || ({} as any);
    const fee = new BigNumber(delta.fee ?? NaN);
    if (!fee.isFinite() || fee.isZero()) {
      return '';
    }
    return `${delta.fee} ${delta.feeToken || 'USDC'}`.trim();
  }

}
