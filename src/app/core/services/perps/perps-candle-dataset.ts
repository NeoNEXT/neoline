import {
  PerpsCandle,
  PerpsCandleInterval,
  perpsIntervalMs,
  PERPS_CANDLE_HISTORY_LIMIT,
} from '@popup/_lib/perps';

/**
 * How much of a candle dataset is known right now.
 *
 * `gapped` is the one that does not simplify away: the feed is live and the
 * trailing bar is moving, but bars that closed while it was down could not be
 * refilled, so the middle of the series is missing and the user has to be told.
 * `unavailable` is the market-data-unavailable state — nothing trustworthy to
 * draw — and is not the same as a market that does not exist.
 */
export type PerpsCandleAvailability =
  | 'loading'
  | 'live'
  | 'gapped'
  | 'unavailable';

/**
 * A (market key, candle interval) dataset as the page sees it.
 *
 * Candles are ascending by open time and only ever grow: the chart tells one
 * dataset from another by its starting point, so trimming the front to hold a
 * fixed window would redraw the series and throw away the user's zoom.
 */
export interface PerpsCandleDatasetState {
  availability: PerpsCandleAvailability;
  candles: PerpsCandle[];
  updatedAt: number | null;
}

/**
 * Fold a fresh snapshot into the candles already on screen.
 *
 * A socket that comes back streams the bar that is open now and nothing else,
 * so every bar that closed while the feed was down is a hole the stream will
 * never fill on its own. Merging by open time rather than replacing keeps the
 * history the user paged in, and lets the newer copy of a bar win: a bar's
 * final OHLCV differs from the last value that streamed while it was still
 * open.
 */
export function mergeCandles(
  existing: PerpsCandle[],
  incoming: PerpsCandle[]
): PerpsCandle[] {
  if (!existing?.length) {
    return incoming ? [...incoming] : [];
  }
  if (!incoming?.length) {
    return existing;
  }
  const byTime = new Map<number, PerpsCandle>();
  existing.forEach((candle) => byTime.set(candle.t, candle));
  // Second, so an overlapping bar is taken from the snapshot.
  incoming.forEach((candle) => byTime.set(candle.t, candle));
  return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
}

/**
 * Fold one live frame into the dataset.
 *
 * Append only. Dropping the oldest bar to hold a fixed window would move the
 * dataset's starting point, which is exactly how the chart tells one dataset
 * from another — so every roll-over would redraw the whole series and throw
 * away the user's zoom. A frame older than the trailing bar is a late arrival
 * for a bar already settled and is ignored rather than reopened.
 */
export function foldCandle(
  candles: PerpsCandle[],
  candle: PerpsCandle
): PerpsCandle[] {
  if (!candle) {
    return candles;
  }
  const last = candles[candles.length - 1];
  if (last && last.t === candle.t) {
    return [...candles.slice(0, -1), candle];
  }
  if (!last || candle.t > last.t) {
    return [...candles, candle];
  }
  return candles;
}

/**
 * Whether remembered candles are still worth putting on screen.
 *
 * Freshness is measured in bars rather than in seconds: a 1m chart is out of
 * date within minutes while a 1d chart is not. One missed bar plus transport
 * jitter is tolerated, which is where the half comes from; past that the gap
 * would be visible and a snapshot is the honest answer.
 */
export function candlesAreFresh(
  candles: PerpsCandle[],
  interval: PerpsCandleInterval,
  now: number
): boolean {
  const last = candles?.[candles.length - 1];
  if (!last) {
    return false;
  }
  return now - last.t <= perpsIntervalMs(interval) * 2.5;
}

/**
 * The time range one snapshot of `limit` bars covers.
 *
 * Hyperliquid returns at most the 5000 most recent candles and ignores ranges
 * beyond that, so this only sizes the request; paging backward moves `endTime`
 * to an already-loaded bar rather than always taking "now".
 */
export function snapshotWindow(
  interval: PerpsCandleInterval,
  limit: number,
  endTime: number
): { startTime: number; endTime: number } {
  return { startTime: endTime - perpsIntervalMs(interval) * limit, endTime };
}

/**
 * The range that refills what the feed missed, and whether it can be joined on.
 *
 * Once the gap is older than the exchange's 5000-bar history the available
 * range is a genuinely different dataset: joining across the hole would draw a
 * continuous series over a middle nobody can fetch, so it is reloaded instead.
 */
export function recoveryWindow(
  candles: PerpsCandle[],
  interval: PerpsCandleInterval,
  now: number
): { startTime: number; endTime: number; reloadAvailableDataset: boolean } {
  const earliestRecoverable =
    now - perpsIntervalMs(interval) * PERPS_CANDLE_HISTORY_LIMIT;
  const lastTime = candles[candles.length - 1].t;
  const reloadAvailableDataset = lastTime < earliestRecoverable;
  return {
    startTime: reloadAvailableDataset ? earliestRecoverable : lastTime,
    endTime: now,
    reloadAvailableDataset,
  };
}
