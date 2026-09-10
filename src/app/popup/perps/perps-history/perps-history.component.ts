import { Component, OnDestroy, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { forkJoin, Observable, of, Subscription, Unsubscribable } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import { isPerpsActivity } from '@app/core/services/perps/perps-activity';
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
import { findMarketByCoin } from '../perps.util';
import {
  ledgerFee,
  ledgerTypeKey,
  orderDirectionKey,
} from './perps-history.pipe';

type PerpsActivityTab =
  | 'orders'
  | 'fills'
  | 'orderHistory'
  | 'transfers';

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
  /** 只展示当前 tab 的加载状态，已收到快照时无需等待 REST。 */
  get tabLoading(): boolean {
    return !this.loading && !this.loadedTabs.has(this.tab) &&
      this.pendingTabs.has(this.tab);
  }
  get loadError(): boolean {
    return this.initialLoadError || this.failedTabs.has(this.tab);
  }
  private initialLoadError = false;
  private failedTabs = new Set<PerpsActivityTab>();
  pendingCancelOrderId: string;
  cancelingOrderId: string;

  /** 账本行的方向要看钱有没有落到本地址上，所以模板里的管道也要拿到它。 */
  address: string;
  /** 各行的精度来源；模板经由 `perpsCoinSzDecimals` 读它。 */
  markets: PerpsMarket[] = [];

  private wallet: EvmWalletJSON;
  private accountSub: Unsubscribable;
  private liveSubs = new Subscription();
  /**
   * 请求订阅。它们必须和实时订阅一样受 `ngOnDestroy` 管辖。
   *
   * 不然会漏掉这条路径：用户在 `load()` 的响应回来之前离开页面，`ngOnDestroy` 退掉了
   * 当时那个 `liveSubs`，随后迟到的回调却会调用 `watchLiveActivity()` —— 它新建一个
   * `liveSubs` 再往里加订阅，而那批订阅此后没有任何人会去退。数据通道对频道做引用计数，
   * 于是计数永远回不到零：频道不拆、套接字不闲置，帧继续被解析进一个没人看的数组。
   */
  private requestSubs = new Subscription();
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
    this.requestSubs.unsubscribe();
  }

  private load() {
    this.loading = true;
    this.initialLoadError = false;
    this.failedTabs.clear();
    this.loadedTabs.clear();
    this.pendingTabs.clear();
    this.historicalOrders = [];
    this.transfers = [];
    this.requestSubs.add(
      forkJoin([
        this.hyperliquid.getOpenOrders(this.address),
        // 市场数据只用于解析取消操作所需的资产 id 与各行的精度。一次被限流或失败的
        // 市场快照，不该把那些加载正常的订单藏起来。
        this.markets$.getMarkets().pipe(catchError(() => of([]))),
      ]).subscribe(
        ([openOrders, markets]) => {
          this.openOrders = this.newestFirst(
            openOrders,
            (order) => order.timestamp
          );
          this.fills = [];
          this.markets = markets;
          this.loadedTabs.add('orders');
          this.loading = false;
          this.watchLiveActivity();
          this.loadTab(this.tab);
        },
        () => {
          this.loading = false;
          this.initialLoadError = true;
        }
      )
    );
  }

  /**
   * 按需拉取的 tab 只有在用户真正打开时才值得发一次请求。
   *
   * 「历史成交」也在其中，但它多一层：`userFills` 订阅一建立，交易场所就会推一条
   * `isSnapshot` 的全量历史，所以常见路径上这次 REST 根本不会发生 —— 用户点到这个 tab
   * 时快照早就到了，`loadedTabs` 会把请求挡掉。只有快照迟迟不来（离线、套接字拨不通）
   * 时才真的花掉这一次带权重的请求，而那正是这条兜底存在的全部理由：数据通道的
   * observable 既不 error 也不 complete，没有它，这个 tab 只会一直转圈，连「失败了」
   * 都说不出口。
   */
  private loadTab(tab: PerpsActivityTab) {
    if (tab === 'orders') {
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
    this.failedTabs.delete(tab);
    this.requestSubs.add(
      this.requestFor(tab).subscribe((res: any[]) => {
        this.acceptTab(tab, res);
        this.pendingTabs.delete(tab);
        this.loadedTabs.add(tab);
        this.failedTabs.delete(tab);
      }, () => {
        this.pendingTabs.delete(tab);
        if (!this.loadedTabs.has(tab)) {
          this.failedTabs.add(tab);
        }
      })
    );
  }

  private requestFor(tab: PerpsActivityTab): Observable<any[]> {
    if (tab === 'fills') {
      return this.hyperliquid.getUserFills(this.address);
    }
    if (tab === 'orderHistory') {
      return this.hyperliquid.getHistoricalOrders(this.address);
    }
    return this.hyperliquid.getLedgerUpdates(this.address);
  }

  private acceptTab(tab: PerpsActivityTab, res: any[]) {
    if (tab === 'fills') {
      // 快照可能已经先到了，也可能随后才到。两边都走 `mergeFills`，于是谁先到都收敛到
      // 同一份 —— 成交是只增不减的，两份历史的并集就是历史本身。
      this.fills = this.mergeFills(res as PerpsFill[], this.fills);
      return;
    }
    if (tab === 'orderHistory') {
      // 每次状态变化一行，与 Hyperliquid 自己的订单历史渲染方式完全一致：一笔先挂单
      // 后成交的订单会出现两次。排序是稳定的，因此时间戳相同的行保持 API 那种
      // 「最新状态在前」的顺序。
      this.historicalOrders = this.newestFirst(
        res as PerpsHistoricalOrder[],
        (row) => row.statusTimestamp
      ).slice(0, MAX_ARCHIVE_ROWS);
      return;
    }
    this.transfers = this.newestFirst(
      res as PerpsLedgerUpdate[],
      (row) => row.time
    ).slice(0, MAX_ARCHIVE_ROWS);
  }

  private watchLiveActivity() {
    this.liveSubs.unsubscribe();
    this.liveSubs = new Subscription();
    this.liveSubs.add(
      this.hyperliquid.watchOpenOrders(this.address).subscribe({
        next: (orders) =>
          (this.openOrders = this.newestFirst(
            orders,
            (order) => order.timestamp
          )),
      })
    );
    // 数据通道的 observable 既不 error 也不 complete（它靠重连和重发订阅自愈），
    // 所以这里没有 error 分支可写 —— 这个 tab 的失败路径是 `loadTab` 里那次 REST。
    this.liveSubs.add(
      this.channel
        // `aggregateByTime` 和 REST 那条路必须一致：一张被盘口多张挂单分批吃掉的单，
        // 交给交易场所合并成一行。少了它，同一笔成交会在推送时分成几行、刷新之后又并成
        // 一行。合并语义见 `getUserFills`。
        .subscribe({
          type: 'userFills',
          user: this.address.toLowerCase(),
          aggregateByTime: true,
        })
        .subscribe((update) => {
          const incoming: PerpsFill[] = (update?.fills || []).filter(isPerpsActivity);
          // 快照是全部真相，增量并进屏幕上已有的那份 —— 但两条路都要重排：交易场所
          // 按时间**升序**下发 `userFills`，而这一页最新的排最上面。
          this.fills = this.mergeFills(
            incoming,
            update?.isSnapshot ? [] : this.fills
          );
          if (update?.isSnapshot) {
            this.loadedTabs.add('fills');
            this.failedTabs.delete('fills');
          }
        })
    );
  }

  private mergeFills(incoming: PerpsFill[], current: PerpsFill[]): PerpsFill[] {
    const seen = new Set<string>();
    const deduped = [...(incoming || []), ...current].filter((fill) => {
      const key = `${fill.tid ?? ''}:${fill.oid ?? ''}:${fill.time}:${fill.px}:${fill.sz}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    return this.newestFirst(deduped, (fill) => fill.time);
  }

  /**
   * 最新的排最上面。
   *
   * 这一页的四个列表都归它管，因为交易场所的顺序不是屏幕的顺序：`userFills` 的快照按时间
   * **升序**下发，挂单则是按 DEX 逐个请求再拼起来的。排序稳定，所以时间戳相同的行保持
   * 交易场所给的先后。
   */
  private newestFirst<T>(rows: T[], time: (row: T) => number): T[] {
    return (rows || []).slice().sort((a, b) => time(b) - time(a));
  }

  setTab(tab: PerpsActivityTab) {
    this.tab = tab;
    this.pendingCancelOrderId = undefined;
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
    const market = findMarketByCoin(this.markets, order.coin);
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

  //#region 规则的转发口
  //
  // 规则本体在 `perps-history.pipe.ts` 上，模板走那里的管道。留在这里的这几个只服务于
  // 代码和测试，模板一个都不调 —— 与 perps-tab 的做法一致。

  orderDirectionKey(order: PerpsOpenOrder): string {
    return orderDirectionKey(order);
  }

  ledgerTypeKey(update: PerpsLedgerUpdate): string {
    return ledgerTypeKey(update, this.address);
  }

  ledgerFee(update: PerpsLedgerUpdate): string {
    return ledgerFee(update);
  }

  //#endregion
}
