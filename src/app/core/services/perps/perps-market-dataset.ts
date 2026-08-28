import BigNumber from 'bignumber.js';

import {
  PerpsAssetCtx,
  PerpsMarket,
  PerpsUniverseItem,
  perpsFiniteDecimal,
} from '@popup/_lib/perps';

/**
 * How a universe entry and a context frame become a 永续合约市场（Perpetual
 * Market）, and how a later frame is folded onto one.
 *
 * These are the rules the 行情数据集（Market Dataset） applies; they are pure so
 * that the arithmetic a screen shows can be checked without a socket, a clock
 * or an HTTP double.
 */

/**
 * How much of the market list can be trusted right now.
 *
 * `incomplete` is the one that is easy to miss: a HIP-3 DEX that fails its
 * snapshot must not hide the canonical markets, so the list is published
 * without it — which is neither `live` (it is not the whole list) nor
 * `unavailable` (the canonical markets did load).
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
  /** Client time of the newest snapshot or frame. */
  updatedAt: number | null;
}

/**
 * The price fields a context frame carries, and the two figures derived from
 * them.
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
    // Quoted against the mid, which is the price every screen displays, so a
    // price and the change beside it can never disagree. `prevDayPx` is the
    // mid of 24h ago, so this is mid against mid — the one comparison that
    // means anything. The mark is an oracle-weighted price that lags the book
    // by design; it stays reserved for margin, liquidation and valuation, and
    // must never stand in here. A market with no mid has no change to quote:
    // that is market statistics unavailable, which is `null` and not `0`.
    changePercentExact: change ? change.toFixed() : null,
    // Derived from the same two prices as the percentage, so the amount and
    // the percentage beside it can never describe different moves.
    changeAmountExact: changeAmount ? changeAmount.toFixed() : null,
    dayVolumeExact,
    openInterestSizeExact,
    openInterestExact,
    fundingExact,
  };
}

/**
 * One universe entry joined with its live context.
 *
 * `assetId` is derived from the entry's position in its own DEX's universe,
 * which is why the caller passes the original index rather than the position
 * in any list built from it.
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
 * Apply one DEX's context frame to the markets of that DEX.
 *
 * Context indexes match that DEX's original universe, so `dexAssetIndex` is
 * the only valid way in — a market's position in this (volume-sorted) array
 * is not an asset identifier. Markets on other DEXes keep their exact object
 * identity, and the array is deliberately not re-sorted: a live price must
 * not move a row out from under the finger about to tap it.
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
