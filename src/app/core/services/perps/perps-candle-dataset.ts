import {
  PerpsCandle,
  PerpsCandleInterval,
  perpsIntervalMs,
  PERPS_CANDLE_HISTORY_LIMIT,
} from '@popup/_lib/perps';

/**
 * 当前对一个 K 线数据集究竟知道多少。
 *
 * `gapped` 是无法被简化掉的那个状态：数据流是实时的、最后一根柱子在动，但断线期间收盘
 * 的那些柱子没能补回来，于是序列中间是缺的，必须告诉用户。`unavailable` 是行情不可用
 * 状态 —— 没有任何可信的数据可画 —— 它不等于市场不存在。
 */
export type PerpsCandleAvailability =
  | 'loading'
  | 'live'
  | 'gapped'
  | 'unavailable';

/**
 * 页面视角下的（市场主键, K 线周期）数据集。
 *
 * K 线按开盘时间升序排列，并且只增不减：图表是靠起点来区分不同数据集的，所以为了维持
 * 固定窗口而裁掉前端，会导致整条序列重绘，并丢掉用户的缩放状态。
 */
export interface PerpsCandleDatasetState {
  availability: PerpsCandleAvailability;
  candles: PerpsCandle[];
  updatedAt: number | null;
}

/**
 * 把一份新快照折叠进屏幕上已有的 K 线。
 *
 * 套接字恢复后只会推送当前正在走的那根柱子，别的都不推，所以断流期间收盘的每一根柱子
 * 都是数据流自己永远补不上的窟窿。按开盘时间合并（而不是整体替换）既保住了用户翻页取回
 * 的历史，又让同一根柱子的较新副本获胜：一根柱子最终的 OHLCV，与它还开着时流式推送的
 * 最后一个值并不相同。
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
  // 放在后面，这样重叠的柱子以快照为准。
  incoming.forEach((candle) => byTime.set(candle.t, candle));
  return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
}

/**
 * 把一帧实时数据折叠进数据集。
 *
 * 只做追加。为了维持固定窗口而丢弃最老的柱子，会移动数据集的起点，而图表恰恰就是靠起点
 * 区分不同数据集的 —— 于是每次滚动都会重绘整条序列，并丢掉用户的缩放状态。比最后一根
 * 柱子还老的帧，是一根已经定型的柱子的迟到消息，直接忽略，而不是把它重新打开。
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
 * 记住的 K 线是否还值得放到屏幕上。
 *
 * 新鲜度以「根」而不是「秒」来衡量：1 分钟图几分钟就过时了，日线图则不会。允许错过一根
 * 柱子外加传输抖动，那半根的余量就是从这儿来的；超过之后缺口就看得见了，此时重新取快照
 * 才是诚实的答案。
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
 * 一次 `limit` 根柱子的快照所覆盖的时间范围。
 *
 * Hyperliquid 最多返回最近 5000 根 K 线，超出的范围会被忽略，所以这里只用于确定请求的
 * 大小；向前翻页时会把 `endTime` 移到一根已加载的柱子上，而不是永远取「现在」。
 */
export function snapshotWindow(
  interval: PerpsCandleInterval,
  limit: number,
  endTime: number
): { startTime: number; endTime: number } {
  return { startTime: endTime - perpsIntervalMs(interval) * limit, endTime };
}

/**
 * 用于补上数据流缺失部分的范围，以及这段数据能否接得上。
 *
 * 一旦缺口比交易场所 5000 根的历史还老，可取到的范围就属于另一个数据集了：跨过窟窿硬接
 * 会画出一条中间段谁也取不到的连续曲线，所以此时改为整体重新加载。
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
