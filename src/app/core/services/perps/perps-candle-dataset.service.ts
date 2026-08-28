import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';

import {
  PerpsCandle,
  PerpsCandleInterval,
  PerpsConnectionState,
  PERPS_CANDLE_LIMIT,
} from '@popup/_lib/perps';

import { HyperliquidService } from './hyperliquid.service';
import { PerpsDataChannel } from './perps-data-channel.service';
import {
  PerpsCandleDatasetState,
  candlesAreFresh,
  foldCandle,
  mergeCandles,
  recoveryWindow,
  snapshotWindow,
} from './perps-candle-dataset';

/**
 * What this module needs from the exchange, and nothing more.
 *
 * Snapshots are asked for as an explicit range: sizing a window from a bar
 * count is this module's own rule, not something the transport should know.
 */
interface PerpsCandleSource {
  getCandleRange(
    coin: string,
    interval: PerpsCandleInterval,
    startTime: number,
    endTime: number
  ): Observable<PerpsCandle[]>;
}

/**
 * How closely snapshot requests may follow one another, across every dataset.
 *
 * Stepping through the interval row is four taps in about a second, and each
 * one names a different dataset — so the rationing cannot live on any single
 * one of them. The first tap still fetches at once so a single one feels
 * instant; the rest of the burst collapses into the tap that ends it, and a
 * dataset the user has already left is dropped rather than fetched.
 */
const SNAPSHOT_WINDOW_MS = 300;

/** Datasets remembered for the session, most recently used last. */
const REMEMBERED_DATASETS = 8;

interface CandleEntry {
  key: string;
  coin: string;
  interval: PerpsCandleInterval;
  subject: BehaviorSubject<PerpsCandleDatasetState>;
  observers: number;
  started: boolean;
  connectionState: PerpsConnectionState;
  subscriptions: Subscription;
  /** Live frames seen while a snapshot was in flight. */
  snapshotBuffer: PerpsCandle[];
  /** Set while a snapshot or gap fill is outstanding for this dataset. */
  requestInFlight: boolean;
  /** A stale → live transition that arrived while a request was open. */
  pendingRecovery: boolean;
  historyExhausted: boolean;
  historyLoading: boolean;
}

/**
 * The K 线数据集 (candle dataset) for each (market key, candle interval).
 *
 * Snapshots and live frames are arbitrated here rather than at the page: the
 * subscription is opened as soon as a dataset is watched, frames that arrive
 * while a snapshot is outstanding are held and folded back in once it lands,
 * and the whole dataset is keyed — so an answer for a market the user has left
 * settles into its own entry instead of racing the one now on screen.
 */
@Injectable({ providedIn: 'root' })
export class PerpsCandleDatasetService {
  private readonly source: PerpsCandleSource;
  private readonly entries = new Map<string, CandleEntry>();
  /**
   * The candles last shown for a market and interval.
   *
   * Kept only for the session and outliving the entry itself: this is what
   * lets a market the user already opened paint before the network answers,
   * not a store of history.
   */
  private readonly remembered = new Map<string, PerpsCandle[]>();
  private snapshotTimer: any = null;
  private pendingSnapshot: CandleEntry | null = null;

  constructor(
    hyperliquid: HyperliquidService,
    private readonly channel: PerpsDataChannel
  ) {
    this.source = hyperliquid;
  }

  /** One dataset, shared by every caller watching the same market and interval. */
  watchDataset(
    coin: string,
    interval: PerpsCandleInterval
  ): Observable<PerpsCandleDatasetState> {
    return new Observable<PerpsCandleDatasetState>((observer) => {
      const entry = this.entry(coin, interval);
      entry.observers += 1;
      const subscription = entry.subject.subscribe(observer);
      if (!entry.started) {
        this.start(entry);
      }
      return () => {
        subscription.unsubscribe();
        entry.observers = Math.max(0, entry.observers - 1);
        this.stopIfUnused(entry);
      };
    });
  }

  /**
   * Another page of bars older than what this dataset already holds.
   *
   * Prepending keeps the dataset's right side intact; an empty page means the
   * exchange has nothing further back, and nothing further is asked for.
   */
  loadEarlier(coin: string, interval: PerpsCandleInterval) {
    const entry = this.entries.get(this.key(coin, interval));
    if (!entry || entry.historyExhausted || entry.historyLoading) {
      return;
    }
    const state = entry.subject.value;
    if (state.availability === 'loading' || !state.candles.length) {
      return;
    }
    entry.historyLoading = true;
    const endTime = state.candles[0].t;
    const { startTime } = snapshotWindow(interval, PERPS_CANDLE_LIMIT, endTime);
    this.source.getCandleRange(coin, interval, startTime, endTime).subscribe({
      next: (res) => {
        entry.historyLoading = false;
        // The exchange may repeat the bar the window ends on.
        const older = (res || []).filter((candle) => candle.t < endTime);
        if (!older.length) {
          entry.historyExhausted = true;
          this.stopIfUnused(entry);
          return;
        }
        this.publish(entry, [...older, ...entry.subject.value.candles]);
        this.stopIfUnused(entry);
      },
      error: () => {
        entry.historyLoading = false;
        this.stopIfUnused(entry);
      },
    });
  }

  private key(coin: string, interval: PerpsCandleInterval): string {
    return `${coin}:${interval}`;
  }

  private entry(coin: string, interval: PerpsCandleInterval): CandleEntry {
    const key = this.key(coin, interval);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        key,
        coin,
        interval,
        subject: new BehaviorSubject<PerpsCandleDatasetState>({
          availability: 'loading',
          candles: [],
          updatedAt: null,
        }),
        observers: 0,
        started: false,
        connectionState: 'connecting',
        subscriptions: new Subscription(),
        snapshotBuffer: [],
        requestInFlight: false,
        pendingRecovery: false,
        historyExhausted: false,
        historyLoading: false,
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private start(entry: CandleEntry) {
    if (entry.started) {
      return;
    }
    entry.started = true;
    entry.subscriptions = new Subscription();

    // Bars this session has already seen are drawn before the network is asked
    // anything: a spinner over a chart we could have painted is the worse
    // answer, and the snapshot behind it corrects the tail a moment later.
    const cached = this.remembered.get(entry.key);
    if (cached && candlesAreFresh(cached, entry.interval, Date.now())) {
      entry.subject.next({
        availability: 'live',
        candles: cached,
        updatedAt: Date.now(),
      });
    }

    entry.subscriptions.add(
      this.channel.watchConnectionState().subscribe((state) => {
        const recovered =
          entry.connectionState === 'stale' && state === 'live';
        entry.connectionState = state;
        if (recovered) {
          this.recover(entry);
        }
      })
    );

    // Frames from the moment the dataset is opened, not from the moment the
    // snapshot answers: a bar that closes in between is one nothing else will
    // ever fill, and the buffer below settles the overlap either way.
    entry.subscriptions.add(
      this.channel
        .subscribe({
          type: 'candle',
          coin: entry.coin,
          interval: entry.interval,
        })
        .subscribe((candle: PerpsCandle) => this.applyFrame(entry, candle))
    );

    this.requestSnapshot(entry);
  }

  private requestSnapshot(entry: CandleEntry) {
    if (this.snapshotTimer) {
      // Only the dataset the user lands on is worth a snapshot.
      this.pendingSnapshot = entry;
      return;
    }
    this.dispatchSnapshot(entry);
    this.openSnapshotWindow();
  }

  private openSnapshotWindow() {
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      const next = this.pendingSnapshot;
      this.pendingSnapshot = null;
      if (next && next.observers > 0) {
        this.dispatchSnapshot(next);
        this.openSnapshotWindow();
      }
    }, SNAPSHOT_WINDOW_MS);
  }

  private dispatchSnapshot(entry: CandleEntry) {
    if (entry.requestInFlight) {
      return;
    }
    const seeded = entry.subject.value.candles.length > 0;
    const { startTime, endTime } = snapshotWindow(
      entry.interval,
      PERPS_CANDLE_LIMIT,
      Date.now()
    );
    this.beginRequest(entry);
    this.source
      .getCandleRange(entry.coin, entry.interval, startTime, endTime)
      .subscribe({
        next: (res) => {
          // The exchange ignores ranges beyond its 5000-bar history, so the
          // limit only trims the tail we render.
          const snapshot = (res || []).slice(-PERPS_CANDLE_LIMIT);
          const buffered = this.finishRequest(entry);
          // A REST response can land after a newer websocket statement for
          // the same bar. Reapplying the frames observed during the request
          // means arrival order cannot make the older snapshot win.
          const merged = mergeCandles(
            seeded
              ? mergeCandles(entry.subject.value.candles, snapshot)
              : snapshot,
            buffered
          );
          // An empty answer is an answer: a market with no bars is not the
          // same as one we could not reach, and only the latter is unavailable.
          this.publish(entry, merged, 'live');
          this.afterRequest(entry);
        },
        error: () => {
          this.finishRequest(entry);
          // Remembered bars stay up: they are what the exchange last said, and
          // an empty chart is not the more honest answer for a top-up that
          // failed.
          if (!seeded) {
            this.publish(entry, [], 'unavailable');
          }
          this.afterRequest(entry);
        },
      });
  }

  /**
   * Refill what the feed missed while it was down.
   *
   * A reconnected socket replays the subscription, but the exchange streams
   * only the bar that is open now: every bar that closed while we were dark is
   * a hole nothing else will ever fill.
   */
  private recover(entry: CandleEntry) {
    if (entry.requestInFlight) {
      entry.pendingRecovery = true;
      return;
    }
    const current = entry.subject.value.candles;
    // Nothing on screen to merge into, so what is owed is the first load.
    if (!current.length) {
      this.requestSnapshot(entry);
      return;
    }
    const { startTime, endTime, reloadAvailableDataset } = recoveryWindow(
      current,
      entry.interval,
      Date.now()
    );
    this.beginRequest(entry);
    this.source
      .getCandleRange(entry.coin, entry.interval, startTime, endTime)
      .subscribe({
        next: (res) => {
          const buffered = this.finishRequest(entry);
          if (reloadAvailableDataset && !res?.length) {
            this.publish(entry, entry.subject.value.candles, 'gapped');
            this.afterRequest(entry);
            return;
          }
          const base = reloadAvailableDataset
            ? res || []
            : mergeCandles(entry.subject.value.candles, res || []);
          this.publish(entry, mergeCandles(base, buffered), 'live');
          this.afterRequest(entry);
        },
        error: () => {
          this.finishRequest(entry);
          // Price frames may be live again while the closed bars remain
          // incomplete. Keep what is known, but expose that interruption.
          this.publish(entry, entry.subject.value.candles, 'gapped');
          this.afterRequest(entry);
        },
      });
  }

  private beginRequest(entry: CandleEntry) {
    entry.requestInFlight = true;
    entry.snapshotBuffer = [];
  }

  private finishRequest(entry: CandleEntry): PerpsCandle[] {
    const buffered = entry.snapshotBuffer;
    entry.snapshotBuffer = [];
    entry.requestInFlight = false;
    return buffered;
  }

  private afterRequest(entry: CandleEntry) {
    if (entry.pendingRecovery) {
      entry.pendingRecovery = false;
      this.recover(entry);
      return;
    }
    this.stopIfUnused(entry);
  }

  /** Fold one live frame into the dataset. */
  private applyFrame(entry: CandleEntry, candle: PerpsCandle) {
    if (!candle) {
      return;
    }
    if (entry.requestInFlight) {
      entry.snapshotBuffer.push(candle);
    }
    const current = entry.subject.value;
    const candles = foldCandle(current.candles, candle);
    if (candles === current.candles) {
      return;
    }
    this.publish(entry, candles);
  }

  /**
   * Put a dataset on the wire and remember it.
   *
   * Availability carries over unless the caller states a new one, so a gap the
   * feed could not refill is not quietly cleared by the next frame — a live
   * trailing bar says nothing about the closed bars still missing behind it.
   */
  private publish(
    entry: CandleEntry,
    candles: PerpsCandle[],
    availability?: PerpsCandleDatasetState['availability']
  ) {
    const current = entry.subject.value;
    const next =
      availability ??
      (current.availability === 'loading' && candles.length
        ? 'live'
        : current.availability);
    this.remember(entry, candles);
    entry.subject.next({
      availability: next,
      candles,
      updatedAt: Date.now(),
    });
  }

  private remember(entry: CandleEntry, candles: PerpsCandle[]) {
    if (!entry.coin || !candles.length) {
      return;
    }
    // Re-inserting moves the key to the end, which keeps the map in
    // least-recently-used order and makes the first key the one to drop.
    this.remembered.delete(entry.key);
    this.remembered.set(entry.key, candles);
    while (this.remembered.size > REMEMBERED_DATASETS) {
      this.remembered.delete(this.remembered.keys().next().value);
    }
  }

  private stopIfUnused(entry: CandleEntry) {
    if (entry.observers > 0 || entry.requestInFlight || entry.historyLoading) {
      return;
    }
    entry.subscriptions.unsubscribe();
    entry.started = false;
    if (this.pendingSnapshot === entry) {
      this.pendingSnapshot = null;
    }
    if (this.entries.get(entry.key) === entry) {
      this.entries.delete(entry.key);
    }
  }
}
