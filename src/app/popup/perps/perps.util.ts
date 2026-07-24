import {
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsOrderPreview,
  PerpsOrderSide,
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
  return Math.floor((Number(size) || 0) * factor) / factor;
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
 * Direction-aware notional reported by Hyperliquid. If the form previews a
 * leverage that has not yet been signed on-chain, scale only the common opening
 * capacity and preserve the opposite-position reduction allowance.
 */
export function availableToTradeForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide,
  leverage = data?.leverage?.value
): number {
  if (!data) {
    return 0;
  }
  const sideIndex = side === 'long' ? 0 : 1;
  const commonCapacity = Math.min(...data.availableToTrade);
  const directionalBonus = data.availableToTrade[sideIndex] - commonCapacity;
  const currentLeverage = data.leverage.value || 1;
  const previewLeverage = Math.max(1, leverage || currentLeverage);
  return (
    commonCapacity * (previewLeverage / currentLeverage) + directionalBonus
  );
}

/** Apply both account capacity and the exchange's per-asset position cap. */
export function maxOrderNotionalForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide,
  leverage = data?.leverage?.value
): number {
  const available = availableToTradeForSide(data, side, leverage);
  if (!data) {
    return available;
  }
  const sideIndex = side === 'long' ? 0 : 1;
  const positionCap = data.maxTradeSzs[sideIndex] * data.markPx;
  return positionCap > 0 ? Math.min(available, positionCap) : available;
}

/**
 * Local estimate of what a market order would cost and where it would liquidate.
 *
 * Liquidation assumes a fresh position backed only by its own margin, with the
 * maintenance margin fraction fixed at 1/(2 × market max leverage) per
 * Hyperliquid's rule. It is an estimate for display; the exchange computes the
 * binding value at fill time from the whole account.
 */
export function previewOrder(params: {
  market: PerpsMarket;
  notional: number;
  leverage: number;
  isLong: boolean;
  /** Taker fee rate as a fraction, e.g. 0.00045 for 4.5bps. */
  feeRate: number;
}): PerpsOrderPreview {
  const { market, notional, leverage, isLong, feeRate } = params;
  const price = market.markPx;
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

  return {
    notional,
    margin,
    size,
    liquidationPx: liquidationPx > 0 ? liquidationPx : 0,
    fee: notional * feeRate,
  };
}
