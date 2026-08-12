import {
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsOrderBook,
  PerpsOrderPreview,
  PerpsOrderSide,
  PerpsPosition,
} from '@popup/_lib/perps';

/** Coins that ship with a bundled logo; everything else falls back to a letter chip. */
const LOCAL_COIN_LOGOS = {
  NEO: 'assets/images/token/neo.png',
  GAS: 'assets/images/token/gas.svg',
  ETH: 'assets/images/token/eth.webp',
  BNB: 'assets/images/token/bnb.webp',
  AVAX: 'assets/images/token/avax.webp',
  MATIC: 'assets/images/token/matic.webp',
  USDC: 'assets/images/token/usdc.webp',
};

const FALLBACK_COLORS = [
  '#f7931a',
  '#627eea',
  '#14f195',
  '#f3ba2f',
  '#e6007a',
  '#2775ca',
  '#8247e5',
  '#ff5c5c',
];

export function coinLogo(coin: string): string {
  return LOCAL_COIN_LOGOS[coin?.toUpperCase()] || '';
}

/** Stable per-coin colour so a market keeps the same chip between renders. */
export function coinColor(coin: string): string {
  let hash = 0;
  for (let i = 0; i < (coin || '').length; i++) {
    hash = (hash * 31 + coin.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/** 1_490_000_000 -> "$1.49B" */
export function formatCompactUsd(value: number): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) {
    return `$${(n / 1e9).toFixed(2)}B`;
  }
  if (abs >= 1e6) {
    return `$${(n / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e3) {
    return `$${Math.round(n / 1e3)}K`;
  }
  return `$${n.toFixed(2)}`;
}

/**
 * Prices span many orders of magnitude (BTC at 64000, kPEPE at 0.008), so the
 * precision follows the magnitude rather than a fixed number of decimals.
 */
export function priceDecimals(price: number): number {
  const abs = Math.abs(Number(price) || 0);
  if (abs >= 10000) {
    return 0;
  }
  if (abs >= 100) {
    return 2;
  }
  if (abs >= 1) {
    return 4;
  }
  return 6;
}

export function formatPrice(price: number): string {
  const n = Number(price) || 0;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: priceDecimals(n),
    maximumFractionDigits: priceDecimals(n),
  });
}

export function formatUsd(value: number, decimals = 2): string {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Signed money, e.g. "+$21.75" — used for PnL where the sign carries meaning. */
export function formatSignedUsd(value: number, decimals = 2): string {
  const n = Number(value) || 0;
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatSignedPercent(value: number, decimals = 2): string {
  const n = Number(value) || 0;
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

/** Format a fractional fee rate for display, e.g. 0.000405 -> "0.0405%". */
export function formatFeeRatePercent(value: number): string {
  const percent = (Number(value) || 0) * 100;
  return `${percent.toFixed(6).replace(/\.?0+$/, '')}%`;
}

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** Format a fill timestamp for the compact history rows: M/D HH:mm. */
export function formatFillTime(time: number): string {
  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
}

/** Size rounded to the market's lot precision, as Hyperliquid requires. */
export function roundSize(size: number, szDecimals: number): number {
  const factor = Math.pow(10, szDecimals);
  const scaledSize = (Number(size) || 0) * factor;
  // Multiplying an exact lot boundary can land a few ulps below its integer
  // (for example 0.0255 * 1e4 -> 254.99999999999997). Compensate only for
  // floating-point representation noise so genuine sub-lot values still floor.
  const tolerance =
    Number.EPSILON * Math.max(1, Math.abs(scaledSize)) * 4;
  return Math.floor(scaledSize + tolerance) / factor;
}

/**
 * Estimate price impact by consuming the live book in execution order.
 * Returns null when the visible book cannot fill the whole order.
 */
export function estimateMarketSlippagePercent(
  book: PerpsOrderBook,
  size: number,
  isBuy: boolean
): number | null {
  if (!book || !Number.isFinite(size) || size <= 0) {
    return null;
  }
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (!bestBid || !bestAsk) {
    return null;
  }
  const midPrice = (bestBid + bestAsk) / 2;
  const levels = isBuy ? book.asks : book.bids;
  let remaining = size;
  let notional = 0;
  for (const level of levels) {
    const filled = Math.min(remaining, level.size);
    notional += filled * level.price;
    remaining -= filled;
    if (remaining <= 1e-12) {
      break;
    }
  }
  if (remaining > 1e-12) {
    return null;
  }
  const averagePrice = notional / size;
  const directionAdjustedImpact = isBuy
    ? averagePrice - midPrice
    : midPrice - averagePrice;
  return Math.max(0, (directionAdjustedImpact / midPrice) * 100);
}

/**
 * Leverage tiers offered by the UI, capped by what the market allows.
 * Always includes 1x and the market maximum so the range is obvious.
 */
export function leverageTiers(maxLeverage: number): number[] {
  const candidates = [1, 2, 3, 5, 10, 20, 25, 40, 50];
  const tiers = candidates.filter((t) => t < maxLeverage).slice(0, 3);
  tiers.push(maxLeverage);
  return tiers;
}

/**
 * Free collateral Hyperliquid reports for this asset, per direction.
 *
 * This is a margin figure in USDC, not a notional: on an account with no
 * position `availableToTrade` equals `withdrawable` exactly, whatever leverage
 * is signed on-chain. It therefore must not be rescaled when the form previews
 * a different leverage — leverage multiplies it into buying power instead (see
 * `collateralToNotional`).
 */
export function availableToTradeForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide
): number {
  if (!data) {
    return 0;
  }
  return data.availableToTrade[side === 'long' ? 0 : 1];
}

/**
 * Buying power of some collateral: leverage multiplies it.
 *
 * No taker fee is set aside. Hyperliquid's own form sizes 100% at exactly
 * collateral × leverage — the exchange already keeps a buffer inside
 * `availableToTrade`, so deducting a fee here would just undershoot its number.
 */
export function collateralToNotional(
  collateral: number,
  leverage: number
): number {
  return Math.max(0, collateral) * Math.max(1, leverage || 1);
}

/** Apply both account buying power and the exchange's per-asset size cap. */
export function maxOrderNotionalForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide,
  leverage: number,
  executionPrice = data?.markPx
): number {
  const notional = collateralToNotional(
    availableToTradeForSide(data, side),
    leverage
  );
  if (!data) {
    return notional;
  }
  const sideIndex = side === 'long' ? 0 : 1;
  const positionCap = data.maxTradeSzs[sideIndex] * executionPrice;
  return positionCap > 0 ? Math.min(notional, positionCap) : notional;
}

/**
 * Notional trimmed to what the market's lot size can actually express: sizes
 * floor to `szDecimals`, so the placeable notional is the floored size priced
 * back out. Hyperliquid's percentage buttons land on this value rather than on
 * the raw buying power — at 10x on 4.80 USDC that is 47.95, not 48.00.
 */
export function notionalAtLotSize(
  notional: number,
  price: number,
  szDecimals: number
): number {
  if (!price || !Number.isFinite(price)) {
    return notional;
  }
  return roundSize(notional / price, szDecimals) * price;
}

/**
 * Preview a reduce-only close from the actual signed position size.
 *
 * A full close must preserve the exchange-reported `szi` exactly. Converting a
 * two-decimal USD display value back through the live mark can round down by one
 * lot and leave an unintended dust position.
 */
export function previewClosePosition(params: {
  position: PerpsPosition;
  notional: number;
  szDecimals: number;
  /** Hyperliquid's own taker fee rate. */
  feeRate: number;
  /** NeoLine's builder fee rate; zero when no builder is configured. */
  builderFeeRate?: number;
  fullClose: boolean;
}): {
  size: number;
  releasedMargin: number;
  fee: number;
  protocolFee: number;
  builderFee: number;
} {
  const {
    position,
    notional,
    szDecimals,
    feeRate,
    builderFeeRate = 0,
    fullClose,
  } = params;
  const positionSize = Math.abs(position?.szi || 0);
  const positionValue = Math.abs(position?.positionValue || 0);
  if (!positionSize || !positionValue) {
    return {
      size: 0,
      releasedMargin: 0,
      fee: 0,
      protocolFee: 0,
      builderFee: 0,
    };
  }
  const requestedFraction = fullClose
    ? 1
    : Math.max(0, Math.min(1, notional / positionValue));
  const size = fullClose
    ? positionSize
    : roundSize(positionSize * requestedFraction, szDecimals);
  const actualFraction = Math.min(1, size / positionSize);
  const closedValue = positionValue * actualFraction;
  const protocolFee = closedValue * feeRate;
  const builderFee = closedValue * builderFeeRate;
  return {
    size,
    releasedMargin: Math.abs(position.marginUsed || 0) * actualFraction,
    fee: protocolFee + builderFee,
    protocolFee,
    builderFee,
  };
}

/**
 * Local estimate of what a market order would cost and where it would liquidate.
 *
 * Liquidation assumes an isolated position backed only by its own margin, with
 * the maintenance margin fraction fixed at 1/(2 × market max leverage) per
 * Hyperliquid's rule. Orders are placed isolated (see perps-order.component),
 * so this matches the exchange's binding value; it still ignores fees and
 * funding, so treat it as a close estimate rather than the exact figure.
 */
export function previewOrder(params: {
  market: PerpsMarket;
  /** Expected entry price; limit orders must not use the current mid price. */
  executionPrice?: number;
  notional: number;
  leverage: number;
  isLong: boolean;
  /** Taker fee rate as a fraction, e.g. 0.00045 for 4.5bps. */
  feeRate: number;
  /** NeoLine's builder fee rate; zero when no builder is configured. */
  builderFeeRate?: number;
}): PerpsOrderPreview {
  const {
    market,
    executionPrice,
    notional,
    leverage,
    isLong,
    feeRate,
    builderFeeRate = 0,
  } = params;
  const price = executionPrice || market.midPx || market.markPx;
  const lev = Math.max(1, leverage);
  const margin = notional / lev;
  const size = price ? roundSize(notional / price, market.szDecimals) : 0;

  // Maintenance margin fraction is half the initial margin at MAX leverage,
  // regardless of the leverage the user picked for this order.
  const maintenanceFraction = 1 / (2 * market.maxLeverage);
  const side = isLong ? 1 : -1;
  const liquidationPx =
    price *
    (1 -
      (side * (1 / lev - maintenanceFraction)) /
        (1 - side * maintenanceFraction));

  const protocolFee = notional * feeRate;
  const builderFee = notional * builderFeeRate;

  return {
    notional,
    margin,
    size,
    liquidationPx: liquidationPx > 0 ? liquidationPx : 0,
    fee: protocolFee + builderFee,
    protocolFee,
    builderFee,
  };
}
