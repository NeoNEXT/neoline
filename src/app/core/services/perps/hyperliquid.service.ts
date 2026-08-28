import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  concat,
  combineLatest,
  of,
  forkJoin,
} from 'rxjs';
import { map, catchError, shareReplay, filter } from 'rxjs/operators';

import {
  HYPERLIQUID_API,
  PerpsAccount,
  PerpsActiveAssetData,
  PerpsAccountMode,
  PerpsAssetCtx,
  PerpsCandle,
  PerpsCandleInterval,
  PerpsDepositConfig,
  PerpsFill,
  PerpsHistoricalOrder,
  PerpsLedgerUpdate,
  PerpsOpenOrder,
  PerpsUniverseItem,
  PerpsUserFeeRates,
  PERPS_DEPOSIT_CONFIG,
  PERPS_HIP3_DEXES,
  perpsFiniteDecimal,
  resolvePerpsTestnet,
} from '@popup/_lib/perps';
import { environment } from '@/environments/environment';
import { parsePerpsAccount } from './perps-account-state';
import { normalizeIds, parseProtocolJson } from './perps-protocol-json';
import { PerpsDataChannel } from './perps-data-channel.service';
import { PerpsExchangeWriteService } from './perps-exchange-write.service';

interface HyperliquidUserFees {
  /** taker 费率：吃掉价差要花多少钱。 */
  userCrossRate: string;
  /** maker 费率：向盘口挂单要花多少钱，为负时表示倒贴给你。 */
  userAddRate: string;
  activeReferralDiscount?: string;
}

/**
 * 对 Hyperliquid 行情与账户数据的只读访问。
 *
 * 每个 info 请求都是发往同一个端点的免鉴权 POST，靠一个 `type` 字段区分。实时更新经由
 * 单条 websocket 到达，该连接按需开启并由所有订阅者共享。
 */

@Injectable({ providedIn: 'root' })
export class HyperliquidService {
  private readonly isTestnet = resolvePerpsTestnet(environment.perpsNetwork);


  /**
   * 按各自的易变程度来缓存快照：
   * - 市场快照 TTL 很短，并由实时上下文刷新；
   * - DEX 注册表不携带价格，比任何一份市场快照都活得久；
   * - 现货状态一直保留到下一次 websocket 更新；
   * - 合并后的账户快照用来吸收短促的导航/请求突发；
   * - 账户抽象模式刷新得很不频繁。
   */
  private readonly accountCacheMs = 3000;
  private readonly accountModeCacheMs = 30 * 60 * 1000;
  private readonly dexRegistryCacheMs = 6 * 60 * 60 * 1000;
  private readonly userFeeCacheMs = 5 * 60 * 1000;
  private dexRegistryCache: {
    expiresAt: number;
    request: Observable<any[]>;
  };
  private accountCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsAccount> }
  >();
  private spotStateCache = new Map<string, Observable<any>>();
  private accountModeCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsAccountMode> }
  >();
  private userFeeCache = new Map<
    string,
    { expiresAt: number; request: Observable<PerpsUserFeeRates> }
  >();

  constructor(
    private http: HttpClient,
    private channel: PerpsDataChannel,
    writes: PerpsExchangeWriteService
  ) {
    // 用户刚做完的一次写入，是这些快照唯一确定是错的时刻。写入路径负责把这件事说出来；
    // 至于怎么应对，仍留在这里 —— 快照住在这儿。
    writes.wrote().subscribe(() => {
      this.accountCache.clear();
      this.spotStateCache.clear();
    });
  }

  private get api() {
    return this.isTestnet ? HYPERLIQUID_API.testnet : HYPERLIQUID_API.mainnet;
  }

  /**
   * 本版本展示的所有 DEX，标准永续在最前。市场上下文、清算所状态和账户总额都遍历这同
   * 一份列表，因此不可能出现某个 DEX 订阅了价格、却在账户里缺席的情况。
   */
  get enabledDexes(): string[] {
    return ['', ...this.supportedHip3Dexes];
  }

  private get supportedHip3Dexes(): string[] {
    return this.isTestnet
      ? PERPS_HIP3_DEXES.testnet
      : PERPS_HIP3_DEXES.mainnet;
  }

  /** 与所配置的 Perps 端点相匹配的入金链/代币。 */
  get depositConfig(): PerpsDepositConfig {
    return this.isTestnet
      ? PERPS_DEPOSIT_CONFIG.testnet
      : PERPS_DEPOSIT_CONFIG.mainnet;
  }

  //#region info 请求

  private post<T>(body: any): Observable<T> {
    return this.http
      .post(this.api.info, body, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'text',
      })
      .pipe(map((text) => parseProtocolJson(text) as T));
  }

  /**
   * 用户自己的永续费率，已包含当前生效的推荐折扣。质押与成交量档位的调整也已经体现在
   * 费率里。
   *
   * 两侧都要读，因为两侧都会被收费：市价单吃掉价差，付的是 `userCrossRate`；而 GTC 限价
   * 单通常会挂在盘口上，按 `userAddRate` 成交。给限价单报 taker 费率会高估它的成本，
   * 在返佣档位上更会把答案的正负号弄反。
   *
   * maker 费率允许为负 —— 那是返佣，把它钳到零会藏起成交实际付回来的钱。
   */
  getUserFeeRates(address: string): Observable<PerpsUserFeeRates> {
    const user = address.toLowerCase();
    const cached = this.userFeeCache.get(user);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.request;
    }

    const request = this.post<HyperliquidUserFees>({
      type: 'userFees',
      user,
    }).pipe(
      map((fees) => {
        const userCrossRate = Number(fees?.userCrossRate);
        const userAddRate = Number(fees?.userAddRate);
        const referralDiscount = Number(
          fees?.activeReferralDiscount || 0
        );
        if (
          !Number.isFinite(userCrossRate) ||
          userCrossRate < 0 ||
          !Number.isFinite(userAddRate) ||
          !Number.isFinite(referralDiscount) ||
          referralDiscount < 0 ||
          referralDiscount > 1
        ) {
          throw new Error('Invalid Hyperliquid user fee response');
        }
        return {
          takerRate: userCrossRate * (1 - referralDiscount),
          // 推荐折扣减少的是「付出去」的钱；它减少不了「付回来」的钱，
          // 所以返佣保持原样、不打折。
          makerRate:
            userAddRate < 0
              ? userAddRate
              : userAddRate * (1 - referralDiscount),
        };
      }),
      catchError((error) => {
        this.userFeeCache.delete(user);
        throw error;
      }),
      shareReplay(1)
    );
    this.userFeeCache.set(user, {
      expiresAt: Date.now() + this.userFeeCacheMs,
      request,
    });
    return request;
  }

  /**
   * builder 部署的 DEX 的注册表。一个 DEX 在这份列表里的位置会被烧进它各市场的资产 id，
   * 所以条目只增不改，整个响应值得缓存的时间远长于它所喂养的价格。失败绝不缓存：它只会
   * 把这次刷新降级为只有标准永续市场，并会被重试。
   */
  getDexRegistry(): Observable<any[]> {
    if (this.supportedHip3Dexes.length === 0) {
      return of([]);
    }
    const now = Date.now();
    if (this.dexRegistryCache?.expiresAt > now) {
      return this.dexRegistryCache.request;
    }
    const request = this.post<any[]>({ type: 'perpDexs' }).pipe(
      catchError(() => {
        if (this.dexRegistryCache?.request === request) {
          this.dexRegistryCache = undefined;
        }
        // 较老的/自建的 API 服务器可能还没暴露 HIP-3 发现接口。
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.dexRegistryCache = {
      expiresAt: now + this.dexRegistryCacheMs,
      request,
    };
    return request;
  }

  /** 某个 DEX 的 universe 及其实时上下文，顺序一一对应。 */
  getMetaAndAssetCtxs(
    dex?: string
  ): Observable<[{ universe: PerpsUniverseItem[] }, PerpsAssetCtx[]]> {
    const body: any = { type: 'metaAndAssetCtxs' };
    if (dex) {
      body.dex = dex;
    }
    return this.post(body);
  }

  /**
   * `address` 的永续账户状态；没有资金时返回一个空账户。
   * 这些数字怎么读由 `userAbstraction` 决定：统一账户用它的现货 USDC 给永续做抵押（因此
   * 现货余额才是事实来源），而标准账户则把永续和现货放在两个独立的钱包里。无论哪种情况
   * 都会去取现货清算所，这样有资金的统一账户不会被报成 $0，标准账户的现货余额也能作为
   * 它本来就是的那个独立钱包被展示出来。
   */
  getAccount(
    address: string,
    force = false,
    dex = ''
  ): Observable<PerpsAccount> {
    const user = address.toLowerCase();
    const cacheKey = `${user}:dex=${dex}`;
    const now = Date.now();
    const cached = this.accountCache.get(cacheKey);
    if (!force && cached?.expiresAt > now) {
      return cached.request;
    }
    const request = forkJoin([
      this.post<any>({ type: 'clearinghouseState', user, dex }),
      // 现货钱包是账户级的。只有标准永续那次快照会读它，
      // 这样「把它折算成抵押品」就不可能每个 DEX 各做一次。
      dex ? of(null) : this.getSpotState(user, force),
      this.getAccountMode(user),
    ]).pipe(
      map(([perps, spot, mode]) =>
        parsePerpsAccount(perps, spot, mode, dex)
      ),
      catchError((error) => {
        if (this.accountCache.get(cacheKey)?.request === request) {
          this.accountCache.delete(cacheKey);
        }
        throw error;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.accountCache.set(cacheKey, {
      expiresAt: now + this.accountCacheMs,
      request,
    });
    return request;
  }

  /**
   * Hyperliquid 对单个永续合约给出的、按方向划分的权威下单容量。
   * 元组顺序是 [做多/买, 做空/卖]。
   */
  getActiveAssetData(
    address: string,
    coin: string
  ): Observable<PerpsActiveAssetData> {
    return this.post<any>({
      type: 'activeAssetData',
      user: address.toLowerCase(),
      coin,
    }).pipe(
      map((data) => this.parseActiveAssetData(data)),
      catchError(() => of(null))
    );
  }

  /**
   * 先用 REST 为下单表单播种，再通过 Hyperliquid 对应的 websocket 订阅，
   * 让它与账户/市场的变化保持一致。
   */
  watchActiveAssetData(
    address: string,
    coin: string
  ): Observable<PerpsActiveAssetData> {
    const user = address.toLowerCase();
    return concat(
      this.getActiveAssetData(user, coin),
      this.channel.subscribe({ type: 'activeAssetData', user, coin }).pipe(
        map((data) => this.parseActiveAssetData(data))
      )
    ).pipe(filter((data) => !!data));
  }

  private parseActiveAssetData(data: any): PerpsActiveAssetData {
    if (
      !data ||
      !Array.isArray(data.maxTradeSzs) ||
      !Array.isArray(data.availableToTrade)
    ) {
      return null;
    }
    const maxTradeSzs: [string, string] = [
      String(data.maxTradeSzs[0]),
      String(data.maxTradeSzs[1]),
    ];
    const availableToTrade: [string, string] = [
      String(data.availableToTrade[0]),
      String(data.availableToTrade[1]),
    ];
    return {
      user: data.user,
      coin: data.coin,
      leverage: {
        type: data.leverage?.type === 'isolated' ? 'isolated' : 'cross',
        value: this.toFiniteNumber(data.leverage?.value) || 1,
        rawUsd:
          data.leverage?.rawUsd === undefined
            ? undefined
            : this.toFiniteNumber(data.leverage.rawUsd),
      },
      maxTradeSzs,
      availableToTrade,
      markPxExact: perpsFiniteDecimal(data.markPx),
      markPx: this.toFiniteNumber(data.markPx),
    };
  }

  /** 初始现货快照；后续的值由 `spotState` 推送替换。 */
  private getSpotState(user: string, force = false): Observable<any> {
    const cached = this.spotStateCache.get(user);
    if (!force && cached) {
      return cached;
    }
    const request = this.post<any>({
      type: 'spotClearinghouseState',
      user,
    }).pipe(
      catchError(() => {
        if (this.spotStateCache.get(user) === request) {
          this.spotStateCache.delete(user);
        }
        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.spotStateCache.set(user, request);
    return request;
  }

  /**
   * 账户抽象模式很少变化。最多每 30 分钟刷新一次，
   * 而地址与网络的变化会立即让它失效。
   */
  private getAccountMode(user: string): Observable<PerpsAccountMode> {
    const now = Date.now();
    const cached = this.accountModeCache.get(user);
    if (cached?.expiresAt > now) {
      return cached.request;
    }
    const request = this.post<PerpsAccountMode>({
      type: 'userAbstraction',
      user,
    }).pipe(
      // 失败时取保守值：未知模式绝不能把现货折算成抵押品。
      catchError(() => {
        if (this.accountModeCache.get(user)?.request === request) {
          this.accountModeCache.delete(user);
        }
        return of('unknown' as PerpsAccountMode);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.accountModeCache.set(user, {
      expiresAt: now + this.accountModeCacheMs,
      request,
    });
    return request;
  }

  private toFiniteNumber(value: any): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** 指定交易场所时间范围的历史 K 线。 */
  getCandleRange(
    coin: string,
    interval: PerpsCandleInterval,
    startTime: number,
    endTime: number
  ): Observable<PerpsCandle[]> {
    return this.post<PerpsCandle[]>({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  getUserFills(address: string): Observable<PerpsFill[]> {
    return this.post<PerpsFill[]>({
      type: 'userFills',
      user: address.toLowerCase(),
    }).pipe(
      map((res) => normalizeIds(Array.isArray(res) ? res : []))
    );
  }

  /** 仍可能成交、因而必须保持可管理的活跃订单。 */
  getOpenOrders(address: string): Observable<PerpsOpenOrder[]> {
    const user = address.toLowerCase();
    return forkJoin(
      this.enabledDexes.map((dex) =>
        this.post<PerpsOpenOrder[]>({
          type: 'frontendOpenOrders',
          user,
          dex,
        }).pipe(
          map((res) => normalizeIds(Array.isArray(res) ? res : []))
        )
      )
    ).pipe(map((ordersByDex) => ordersByDex.flat()));
  }

  /** 用户盘口一有变化就推送的完整挂单快照。 */
  watchOpenOrders(address: string): Observable<PerpsOpenOrder[]> {
    const user = address.toLowerCase();
    return combineLatest(
      this.enabledDexes.map((dex) =>
        this.channel.subscribe({ type: 'openOrders', user, dex }).pipe(
          map((data) => (Array.isArray(data?.orders) ? data.orders : []))
        )
      )
    ).pipe(map((ordersByDex) => ordersByDex.flat()));
  }

  /** 已经离开盘口的订单。Hyperliquid 把它限制在 2000 行。 */
  getHistoricalOrders(address: string): Observable<PerpsHistoricalOrder[]> {
    return this.post<PerpsHistoricalOrder[]>({
      type: 'historicalOrders',
      user: address.toLowerCase(),
    }).pipe(
      map((res) => normalizeIds(Array.isArray(res) ? res : []))
    );
  }

  /**
   * 跨桥出入金以及转账。资金费支付在另一个端点上，这里刻意不含它们。
   */
  getLedgerUpdates(address: string): Observable<PerpsLedgerUpdate[]> {
    return this.post<PerpsLedgerUpdate[]>({
      type: 'userNonFundingLedgerUpdates',
      user: address.toLowerCase(),
      startTime: 0,
    }).pipe(map((res) => (Array.isArray(res) ? res : [])));
  }

  //#endregion

}
