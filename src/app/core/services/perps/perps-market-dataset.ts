import BigNumber from 'bignumber.js';

import {
  PerpsAssetCtx,
  PerpsMarket,
  PerpsUniverseItem,
  perpsFiniteDecimal,
} from '@popup/_lib/perps';

/**
 * 一条 universe 条目与一帧上下文如何变成一个永续合约市场（Perpetual Market），
 * 以及后来的帧如何折叠到它上面。
 *
 * 这些是行情数据集（Market Dataset）所应用的规则；它们是纯函数，因此屏幕上显示的算术
 * 结果无需套接字、时钟或 HTTP 替身就能验证。
 */

/**
 * 当前的市场列表有多少是可信的。
 *
 * `incomplete` 是容易被忽略的那个：某个 HIP-3 DEX 的快照失败了，也不能因此把标准永续
 * 市场一起藏起来，所以列表会在缺它的情况下发布 —— 这既不是 `live`（列表并不完整），
 * 也不是 `unavailable`（标准永续市场确实加载成功了）。
 */
export type PerpsMarketAvailability =
  | 'loading'
  | 'live'
  | 'incomplete'
  | 'stale'
  | 'unavailable';

export interface PerpsMarketDatasetState {
  availability: PerpsMarketAvailability;
  markets: PerpsMarket[];
  /** 最新一次快照或帧的客户端时间。 */
  updatedAt: number | null;
}

/**
 * 一帧上下文所携带的价格字段，以及由它们推导出的两个数字。
 */
export function marketContextFields(
  ctx: PerpsAssetCtx
): Pick<
  PerpsMarket,
  | 'markPxExact'
  | 'midPxExact'
  | 'oraclePxExact'
  | 'prevDayPxExact'
  | 'changePercentExact'
  | 'changeAmountExact'
  | 'dayVolumeExact'
  | 'openInterestExact'
  | 'openInterestSizeExact'
  | 'fundingExact'
> {
  const markPxExact = perpsFiniteDecimal(ctx.markPx);
  const rawMidPxExact =
    ctx.midPx === null ? null : perpsFiniteDecimal(ctx.midPx);
  const midPxExact =
    rawMidPxExact && new BigNumber(rawMidPxExact).isGreaterThan(0)
      ? rawMidPxExact
      : null;
  const oraclePxExact = perpsFiniteDecimal(ctx.oraclePx);
  const prevDayPxExact = perpsFiniteDecimal(ctx.prevDayPx);
  const dayVolumeExact = perpsFiniteDecimal(ctx.dayNtlVlm);
  const openInterestSizeExact = perpsFiniteDecimal(ctx.openInterest);
  const openInterestExact = new BigNumber(openInterestSizeExact)
    .times(markPxExact)
    .toFixed();
  const fundingExact = perpsFiniteDecimal(ctx.funding);
  const changeAmount =
    midPxExact && new BigNumber(prevDayPxExact).isGreaterThan(0)
      ? new BigNumber(midPxExact).minus(prevDayPxExact)
      : null;
  const change = changeAmount
    ? changeAmount.dividedBy(prevDayPxExact).times(100)
    : null;
  return {
    markPxExact,
    midPxExact,
    oraclePxExact,
    prevDayPxExact,
    // 以中间价为基准报出，而中间价正是所有界面显示的价格，因此价格和它旁边的涨跌永远
    // 不会互相矛盾。`prevDayPx` 是 24 小时前的中间价，所以这是中间价对中间价 —— 唯一
    // 有意义的比较。标记价格是按预言机加权的价格，设计上就落后于盘口；它只保留给保证金、
    // 强平和估值使用，绝不能在这里顶替。没有中间价的市场也就没有涨跌可报：那属于市场
    // 统计不可用，应为 `null` 而不是 `0`。
    changePercentExact: change ? change.toFixed() : null,
    // 与百分比取自同样的两个价格，因此涨跌额和它旁边的百分比不可能描述不同的行情。
    changeAmountExact: changeAmount ? changeAmount.toFixed() : null,
    dayVolumeExact,
    openInterestSizeExact,
    openInterestExact,
    fundingExact,
  };
}

/**
 * 一条 universe 条目与它的实时上下文合并的结果。
 *
 * `assetId` 是由该条目在它自己 DEX 的 universe 中的位置推导出来的，所以调用方要传入
 * 原始下标，而不是它在任何派生列表中的位置。
 */
export function buildMarket(
  item: PerpsUniverseItem,
  ctx: PerpsAssetCtx,
  dex: string,
  dexIndex: number,
  index: number
): PerpsMarket {
  const protocolCoin =
    dex && !item.name.includes(':') ? `${dex}:${item.name}` : item.name;
  const symbol = protocolCoin.includes(':')
    ? protocolCoin.slice(protocolCoin.indexOf(':') + 1)
    : protocolCoin;
  const marginMode =
    item.marginMode === 'strictIsolated' || item.marginMode === 'noCross'
      ? item.marginMode
      : null;
  return {
    key: `${dex || 'hl'}:${symbol}`,
    assetId: dex ? 100000 + dexIndex * 10000 + index : index,
    dex,
    dexAssetIndex: index,
    coin: protocolCoin,
    symbol,
    szDecimals: item.szDecimals,
    maxLeverage: item.maxLeverage,
    marginMode,
    ...marketContextFields(ctx),
  };
}

/**
 * 把某个 DEX 的上下文帧应用到该 DEX 的各个市场上。
 *
 * 上下文的下标对应的是该 DEX 原始的 universe，所以 `dexAssetIndex` 是唯一有效的入口 ——
 * 一个市场在这个（按成交量排序的）数组里的位置并不是资产标识。其他 DEX 上的市场保持
 * 完全相同的对象身份，而且这个数组刻意不重新排序：实时价格不该把一行从手指即将点下去的
 * 位置底下挪走。
 */
export function mergeDexAssetContexts(
  markets: PerpsMarket[],
  dex: string,
  ctxs: PerpsAssetCtx[]
): PerpsMarket[] {
  if (!Array.isArray(ctxs) || ctxs.length === 0) {
    return markets;
  }
  return markets.map((market) => {
    if (market.dex !== dex) {
      return market;
    }
    const ctx = ctxs[market.dexAssetIndex];
    return ctx ? { ...market, ...marketContextFields(ctx) } : market;
  });
}
