import { Injectable } from '@angular/core';
import { EMPTY, Observable, combineLatest, forkJoin, merge, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

import {
  PerpsAccount,
  PerpsAccountState,
  PerpsAggregatedAccount,
  PerpsConnectionState,
} from '@popup/_lib/perps';
import { HyperliquidService } from './hyperliquid.service';
import { PerpsDataChannel } from './perps-data-channel.service';
import { PerpsDataset } from './perps-dataset';
import {
  aggregatePerpsAccounts,
  updatePerpsAccountFromClearinghouseState,
  updatePerpsAccountFromSpotState,
} from './perps-account-state';

/**
 * 本模块需要交易场所提供的全部东西，不多不少。
 */
interface PerpsAccountSource {
  readonly enabledDexes: string[];
  getAccount(
    address: string,
    force?: boolean,
    dex?: string
  ): Observable<PerpsAccount>;
}

/** 一个地址在一个 DEX 上的账户。 */
interface PerpsAccountKey {
  user: string;
  dex: string;
}

type AccountFrame =
  | { kind: 'spot'; value: any }
  | { kind: 'clearinghouse'; value: any };

const LOADING: PerpsAccountState<PerpsAccount> = {
  availability: 'loading',
  account: null,
  missingDexes: [],
  updatedAt: null,
};

/**
 * **账户状态** —— 交易场所此刻对一个地址的说法。
 *
 * 快照与帧的仲裁归共享的**数据集**核心，见
 * [ADR-0008](../../../../../docs/adr/0008-shared-dataset-snapshot-frame-arbiter.md)。
 * 只有账户特有的东西留在这里：哪些频道承载账户、一次失败的读取如何在不声称事实为零的
 * 前提下被报告出来，以及跨所有已启用 DEX 的那份只读汇总。
 */
@Injectable({ providedIn: 'root' })
export class PerpsAccountStateService {
  private readonly source: PerpsAccountSource;
  private readonly dataset: PerpsDataset<
    PerpsAccountKey,
    PerpsAccountState<PerpsAccount>,
    AccountFrame
  >;
  private readonly aggregateStreams = new Map<
    string,
    Observable<PerpsAccountState<PerpsAggregatedAccount>>
  >();
  /**
   * 连接态变化**做什么**由核心决定；本数据集还得知道它当前**是什么**，因为可用性要点名它：
   * 数据源已经断开时一次经由 REST 成功的读取，不是实时数据。
   */
  private connectionState: PerpsConnectionState = 'connecting';

  constructor(hyperliquid: HyperliquidService, channel: PerpsDataChannel) {
    this.source = hyperliquid;
    channel
      .watchConnectionState()
      .subscribe((state) => (this.connectionState = state));
    this.dataset = new PerpsDataset(channel, {
      initial: LOADING,
      keyOf: ({ user, dex }) => `${user}:dex=${dex}`,
      frames: ({ user, dex }) =>
        merge(
          channel
            .subscribe({ type: 'clearinghouseState', user, dex })
            .pipe(
              map((value) => ({ kind: 'clearinghouse' as const, value }))
            ),
          // 现货钱包是账户级的，所以只有标准条目去读它 ——
          // 把它折进抵押品这件事不能每个 DEX 各做一次。
          dex
            ? EMPTY
            : channel
                .subscribe({ type: 'spotState', user })
                .pipe(map((value) => ({ kind: 'spot' as const, value })))
        ),
      load: (key, current) => this.loadAccount(key, current),
      foldFrame: (state, frame) => this.foldFrame(state, frame),
      onConnectionState: (state, current) =>
        state === 'stale'
          ? {
              ...current,
              availability: current.account ? 'stale' : 'unavailable',
            }
          : current,
    });
  }

  /** 一个 DEX 上的账户，由所有观察同一地址的调用方共享。 */
  watchAccount(
    address: string,
    dex = ''
  ): Observable<PerpsAccountState<PerpsAccount>> {
    const key = { user: address.toLowerCase(), dex };
    return new Observable<PerpsAccountState<PerpsAccount>>((observer) => {
      const subscription = this.dataset.watch(key).subscribe(observer);
      // 这个地址还什么都没读过，所以刚订上来的观察者欠他第一次读取。
      if (this.dataset.peek(key).availability === 'loading') {
        this.dataset.refresh(key).subscribe({ error: () => undefined });
      }
      return () => subscription.unsubscribe();
    });
  }

  /** 重新取一次单个 DEX 的快照，折叠进同一份实时状态。 */
  refreshAccount(
    address: string,
    dex = ''
  ): Observable<PerpsAccountState<PerpsAccount>> {
    return this.dataset.refresh({ user: address.toLowerCase(), dex });
  }

  /** 所有已启用的 DEX，与其他页面共用同一批单 DEX 数据流。 */
  watchAggregatedAccount(
    address: string
  ): Observable<PerpsAccountState<PerpsAggregatedAccount>> {
    const user = address.toLowerCase();
    let stream = this.aggregateStreams.get(user);
    if (!stream) {
      stream = combineLatest(
        this.source.enabledDexes.map((dex) => this.watchAccount(user, dex))
      ).pipe(
        map((states) => this.aggregate(states)),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.aggregateStreams.set(user, stream);
    }
    return stream;
  }

  /** 刷新所有已启用的 DEX，每个 DEX 上共用在飞的那次请求。 */
  refreshAggregatedAccount(
    address: string
  ): Observable<PerpsAccountState<PerpsAggregatedAccount>> {
    const user = address.toLowerCase();
    return forkJoin(
      this.source.enabledDexes.map((dex) => this.refreshAccount(user, dex))
    ).pipe(map((states) => this.aggregate(states)));
  }

  /**
   * 一次失败的读取对余额什么都没说 —— 它不能把余额报成零。数据源断开期间，已经拿到的
   * 东西继续留在屏幕上；什么都没拿到时，这个 DEX 改报为缺失。
   */
  private loadAccount(
    key: PerpsAccountKey,
    current: PerpsAccountState<PerpsAccount>
  ): Observable<PerpsAccountState<PerpsAccount>> {
    return this.source.getAccount(key.user, true, key.dex).pipe(
      map((account) => ({
        availability:
          this.connectionState === 'stale'
            ? ('stale' as const)
            : ('live' as const),
        account,
        missingDexes: [],
        updatedAt: Date.now(),
      })),
      catchError(() => {
        const keepsStale =
          this.connectionState === 'stale' && !!current.account;
        return of({
          availability: keepsStale
            ? ('stale' as const)
            : ('unavailable' as const),
          account: keepsStale ? current.account : null,
          missingDexes: keepsStale ? [] : [key.dex],
          updatedAt: current.updatedAt,
        });
      })
    );
  }

  /**
   * 把一帧频道数据折叠进账户。
   *
   * 帧更新的是已经读到的事实上的数值，它建立不了账户本身 —— 所以什么都还没读到时，
   * 也就没有东西可供折叠。可用性原样保留：一条已经被报为陈旧的数据源上来了一帧，
   * 并不会让它重新变回实时。
   */
  private foldFrame(
    state: PerpsAccountState<PerpsAccount>,
    frame: AccountFrame
  ): PerpsAccountState<PerpsAccount> {
    if (!state.account) {
      return state;
    }
    return {
      availability: state.availability,
      account:
        frame.kind === 'spot'
          ? updatePerpsAccountFromSpotState(state.account, frame.value)
          : updatePerpsAccountFromClearinghouseState(
              state.account,
              frame.value
            ),
      missingDexes: [],
      updatedAt: Date.now(),
    };
  }

  private aggregate(
    states: PerpsAccountState<PerpsAccount>[]
  ): PerpsAccountState<PerpsAggregatedAccount> {
    const loading = states.some((state) => state.availability === 'loading');
    const stale = states.some((state) => state.availability === 'stale');
    const missingDexes = states.reduce(
      (missing, state, index) => {
        if (!state.account && state.availability !== 'loading') {
          missing.push(this.source.enabledDexes[index]);
        }
        return missing;
      },
      [] as string[]
    );
    const accounts = states
      .map((state) => state.account)
      .filter((account): account is PerpsAccount => !!account);
    const updated = states
      .filter((state) => !!state.account)
      .map((state) => state.updatedAt)
      .filter((value): value is number => value !== null);
    const account = accounts.length
      ? aggregatePerpsAccounts(accounts, missingDexes)
      : null;
    return {
      availability: loading
        ? 'loading'
        : stale && account
        ? 'stale'
        : !account
        ? 'unavailable'
        : missingDexes.length
        ? 'incomplete'
        : 'live',
      account,
      missingDexes,
      updatedAt: updated.length ? Math.min(...updated) : null,
    };
  }
}
