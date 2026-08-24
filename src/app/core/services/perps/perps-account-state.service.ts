import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  forkJoin,
  Observable,
  ReplaySubject,
  Subscription,
} from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

import {
  PerpsAccount,
  PerpsAccountState,
  PerpsAggregatedAccount,
  PerpsConnectionState,
} from '@popup/_lib/perps';
import { HyperliquidService } from './hyperliquid.service';
import {
  aggregatePerpsAccounts,
  updatePerpsAccountFromClearinghouseState,
  updatePerpsAccountFromSpotState,
} from './perps-account-state';

interface PerpsAccountSource {
  readonly enabledDexes: string[];
  getAccount(
    address: string,
    force?: boolean,
    dex?: string
  ): Observable<PerpsAccount>;
  subscribe(subscription: any): Observable<any>;
  watchConnectionState(): Observable<PerpsConnectionState>;
}

type AccountFrame =
  | { kind: 'spot'; value: any }
  | { kind: 'clearinghouse'; value: any };

interface AccountEntry {
  key: string;
  user: string;
  dex: string;
  subject: BehaviorSubject<PerpsAccountState<PerpsAccount>>;
  observers: number;
  started: boolean;
  connectionState: PerpsConnectionState;
  subscriptions: Subscription;
  refreshBuffer: AccountFrame[];
  refresh$: Observable<PerpsAccountState<PerpsAccount>>;
}

@Injectable({ providedIn: 'root' })
export class PerpsAccountStateService {
  private readonly source: PerpsAccountSource;
  private readonly entries = new Map<string, AccountEntry>();
  private readonly aggregateStreams = new Map<
    string,
    Observable<PerpsAccountState<PerpsAggregatedAccount>>
  >();

  constructor(hyperliquid: HyperliquidService) {
    this.source = hyperliquid;
  }

  /** One DEX account, shared by every caller observing the same address. */
  watchAccount(
    address: string,
    dex = ''
  ): Observable<PerpsAccountState<PerpsAccount>> {
    const user = address.toLowerCase();
    return new Observable((observer) => {
      const entry = this.entry(user, dex);
      entry.observers += 1;
      const subscription = entry.subject.subscribe(observer);
      if (!entry.started) {
        this.start(entry);
      }
      if (!entry.refresh$ && entry.subject.value.availability === 'loading') {
        this.refresh(entry);
      }
      return () => {
        subscription.unsubscribe();
        entry.observers = Math.max(0, entry.observers - 1);
        this.stopIfUnused(entry);
      };
    });
  }

  /** A fresh single-DEX snapshot folded into the same live state. */
  refreshAccount(
    address: string,
    dex = ''
  ): Observable<PerpsAccountState<PerpsAccount>> {
    const entry = this.entry(address.toLowerCase(), dex);
    if (!entry.started) {
      this.start(entry);
    }
    return this.refresh(entry);
  }

  /** Every enabled DEX, sharing the same single-DEX streams as other pages. */
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

  /** Refresh every enabled DEX, sharing in-flight work per DEX. */
  refreshAggregatedAccount(
    address: string
  ): Observable<PerpsAccountState<PerpsAggregatedAccount>> {
    const user = address.toLowerCase();
    return forkJoin(
      this.source.enabledDexes.map((dex) => this.refreshAccount(user, dex))
    ).pipe(map((states) => this.aggregate(states)));
  }

  private entry(user: string, dex: string): AccountEntry {
    const key = `${user}:dex=${dex}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        key,
        user,
        dex,
        subject: new BehaviorSubject({
          availability: 'loading',
          account: null,
          missingDexes: [],
          updatedAt: null,
        }),
        observers: 0,
        started: false,
        connectionState: 'connecting',
        subscriptions: new Subscription(),
        refreshBuffer: [],
        refresh$: null,
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private start(entry: AccountEntry) {
    if (entry.started) {
      return;
    }
    entry.started = true;
    entry.subscriptions = new Subscription();
    entry.subscriptions.add(
      this.source.watchConnectionState().subscribe((state) => {
        const recovered =
          entry.connectionState === 'stale' && state === 'live';
        entry.connectionState = state;
        const current = entry.subject.value;
        if (state === 'stale') {
          entry.subject.next({
            ...current,
            availability: current.account ? 'stale' : 'unavailable',
          });
        } else if (recovered) {
          this.refresh(entry);
        }
      })
    );
    if (!entry.dex) {
      entry.subscriptions.add(
        this.source
          .subscribe({ type: 'spotState', user: entry.user })
          .subscribe((value) =>
            this.applyFrame(entry, { kind: 'spot', value })
          )
      );
    }
    entry.subscriptions.add(
      this.source
        .subscribe({
          type: 'clearinghouseState',
          user: entry.user,
          dex: entry.dex,
        })
        .subscribe((value) =>
          this.applyFrame(entry, { kind: 'clearinghouse', value })
        )
    );
  }

  private refresh(
    entry: AccountEntry
  ): Observable<PerpsAccountState<PerpsAccount>> {
    if (entry.refresh$) {
      return entry.refresh$;
    }
    entry.refreshBuffer = [];
    const result = new ReplaySubject<PerpsAccountState<PerpsAccount>>(1);
    const observable = result.asObservable();
    entry.refresh$ = observable;
    this.source.getAccount(entry.user, true, entry.dex).subscribe({
      next: (snapshot) => {
        const account = entry.refreshBuffer.reduce(
          (current, frame) => this.foldFrame(current, frame),
          snapshot
        );
        entry.refreshBuffer = [];
        const state: PerpsAccountState<PerpsAccount> = {
          availability:
            entry.connectionState === 'stale' ? 'stale' : 'live',
          account,
          missingDexes: [],
          updatedAt: Date.now(),
        };
        entry.subject.next(state);
        result.next(state);
        result.complete();
        this.finishRefresh(entry);
      },
      error: () => {
        entry.refreshBuffer = [];
        const current = entry.subject.value;
        const keepsStale =
          entry.connectionState === 'stale' && !!current.account;
        const state: PerpsAccountState<PerpsAccount> = {
          availability: keepsStale ? 'stale' : 'unavailable',
          account: keepsStale ? current.account : null,
          missingDexes: keepsStale ? [] : [entry.dex],
          updatedAt: current.updatedAt,
        };
        entry.subject.next(state);
        result.next(state);
        result.complete();
        this.finishRefresh(entry);
      },
    });
    return observable;
  }

  private finishRefresh(entry: AccountEntry) {
    entry.refresh$ = null;
    this.stopIfUnused(entry);
  }

  private applyFrame(entry: AccountEntry, frame: AccountFrame) {
    if (entry.refresh$) {
      entry.refreshBuffer.push(frame);
    }
    const current = entry.subject.value;
    if (!current.account) {
      return;
    }
    entry.subject.next({
      availability:
        entry.connectionState === 'stale' ? 'stale' : 'live',
      account: this.foldFrame(current.account, frame),
      missingDexes: [],
      updatedAt: Date.now(),
    });
  }

  private foldFrame(account: PerpsAccount, frame: AccountFrame): PerpsAccount {
    return frame.kind === 'spot'
      ? updatePerpsAccountFromSpotState(account, frame.value)
      : updatePerpsAccountFromClearinghouseState(account, frame.value);
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

  private stopIfUnused(entry: AccountEntry) {
    if (entry.observers > 0 || entry.refresh$) {
      return;
    }
    entry.subscriptions.unsubscribe();
    entry.started = false;
    if (this.entries.get(entry.key) === entry) {
      this.entries.delete(entry.key);
    }
  }
}
