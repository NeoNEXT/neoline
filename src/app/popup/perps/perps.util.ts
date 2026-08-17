import {
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsOrderBook,
  PerpsOrderPreview,
  PerpsOrderSide,
  PerpsPosition,
} from '@popup/_lib/perps';
import BigNumber from 'bignumber.js';

/**
 * What a formatter accepts: a protocol-precision decimal string, or the absence
 * of one. Formatters are the render boundary — the only place a decimal string
 * may become a JavaScript number, and only to be turned straight into text.
 */
export type PerpsExactValue = BigNumber.Value | null | undefined;

/** Shown wherever a value is genuinely absent, so it never reads as zero. */
export const MISSING_DISPLAY = '--';

function isMissing(value: PerpsExactValue): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  return !new BigNumber(value).isFinite();
}

/**
 * Coins whose mark ships with the wallet, so it renders without a network round
 * trip. NEO and GAS are deliberately absent: Hyperliquid carries both, in the
 * same drawing style as every other row, and the bundled pair were the odd ones
 * out. Only keep an entry here for a coin the CDN gets wrong or does not have.
 */
const LOCAL_COIN_LOGOS = {
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

/**
 * Hyperliquid's own coin marks, which cover the canonical DEX's listings.
 *
 * A miss here is not a `404`: unknown coins answer `200` with the Hyperliquid
 * app's HTML shell, so the only observable miss is the image failing to decode.
 * Callers must fall back on the image's `error` event, never on a status check.
 */
const REMOTE_COIN_LOGO_PREFIX = 'https://app.hyperliquid.xyz/coins/';

/**
 * The mark's name on the CDN, whose path segments are case-sensitive.
 *
 * A leading `k` is Hyperliquid's 1000x contract-size prefix, not part of the
 * asset: `kPEPE` is quoted in 1000-PEPE lots and wears PEPE's mark. Real
 * symbols are uppercase, so a lowercase `k` in front of one is unambiguous.
 */
function coinMarkName(coin: string): string {
  return /^k[A-Z0-9]/.test(coin) ? coin.slice(1) : coin.toUpperCase();
}

/**
 * The market's mark: bundled asset first, then Hyperliquid's CDN.
 *
 * Keyed by the protocol `coin`, not the display symbol — a HIP-3 market's mark
 * lives under its full `dex:SYMBOL` name (`xyz:SNDK.svg`), and the bare symbol
 * gets nothing. The prefix is part of the path and is passed through untouched:
 * the DEX name is lowercase while the symbol is upper, so re-casing either half
 * misses. That also keeps `flx:GAS` (natural gas) away from the bundled GAS
 * mark, which is a different asset that happens to share a symbol.
 *
 * Returns `''` only for an absent coin. A coin the CDN does not carry still
 * returns a URL, and resolves to the letter chip when that image fails to load.
 */
export function coinLogo(coin: string): string {
  if (!coin) {
    return '';
  }
  if (coin.includes(':')) {
    return `${REMOTE_COIN_LOGO_PREFIX}${encodeURIComponent(coin)}.svg`;
  }
  const local = LOCAL_COIN_LOGOS[coin.toUpperCase()];
  if (local) {
    return local;
  }
  const name = encodeURIComponent(coinMarkName(coin));
  return `${REMOTE_COIN_LOGO_PREFIX}${name}.svg`;
}

/** Stable per-coin colour so a market keeps the same chip between renders. */
export function coinColor(coin: string): string {
  let hash = 0;
  for (let i = 0; i < (coin || '').length; i++) {
    hash = (hash * 31 + coin.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/**
 * Volume and open interest, in magnitude bands: 1_490_000_000 -> "$1.49B".
 *
 * Every band carries the same two decimals and drops trailing zeros, so a row
 * reading "$1.7B" sits beside one reading "$90.5K" without the two looking like
 * they were measured differently.
 */
export function formatCompactUsd(value: PerpsExactValue): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const amount = new BigNumber(value);
  const abs = amount.absoluteValue();
  const sign = amount.isNegative() ? '-' : '';
  const band = COMPACT_BANDS.find((item) =>
    abs.isGreaterThanOrEqualTo(item.threshold)
  );
  const scaled = band ? abs.dividedBy(band.threshold) : abs;
  return `${sign}$${stripTrailingZeros(scaled.toFixed(2))}${
    band ? band.suffix : ''
  }`;
}

const COMPACT_BANDS = [
  { threshold: new BigNumber('1e12'), suffix: 'T' },
  { threshold: new BigNumber('1e9'), suffix: 'B' },
  { threshold: new BigNumber('1e6'), suffix: 'M' },
  { threshold: new BigNumber('1e3'), suffix: 'K' },
];

function stripTrailingZeros(text: string): string {
  return text.includes('.')
    ? text.replace(/\.?0+$/, '')
    : text;
}

/**
 * Decimal places a market can actually quote.
 *
 * Hyperliquid ticks perp prices at `6 - szDecimals` decimals, so that — not a
 * table of magnitude bands — is what decides the precision worth showing: BTC
 * (`szDecimals` 5) quotes one decimal, PUMP (`szDecimals` 0) quotes six. A mid
 * is the average of two ticks and so may carry one decimal more than a tick.
 *
 * Without a market to consult the value is left exactly as the exchange sent
 * it: it is already tick-quantised, and inventing a cap here would round away
 * a digit the exchange considers real.
 */
export function priceDecimals(
  price: PerpsExactValue,
  szDecimals?: number,
  isMid = false
): number {
  const fraction = (isMissing(price) ? '0' : new BigNumber(price).toFixed())
    .split('.')[1];
  const actual = fraction ? fraction.length : 0;
  if (szDecimals === undefined) {
    return actual;
  }
  // The tick is a ceiling, not a target: padding $294 out to "294.0000" claims
  // a precision the price does not have, while a value that somehow exceeds the
  // tick is the one case the ceiling has to bite.
  const cap =
    Math.max(0, PERPS_PRICE_MAX_DECIMALS - szDecimals) + (isMid ? 1 : 0);
  return Math.min(actual, cap);
}

/** Hyperliquid quotes perp prices at up to six decimals, less `szDecimals`. */
const PERPS_PRICE_MAX_DECIMALS = 6;

/**
 * A price without its currency symbol — templates supply the `$`.
 *
 * Formatted from the protocol decimal itself rather than from a float of it,
 * and never truncated to a significant-figure count: BTC at `63393.5` reads
 * "63,393.5" here exactly as it does on Hyperliquid, where rounding to five
 * figures would have shown "63,394" and quietly disagreed with the exchange.
 */
export function formatPrice(
  price: PerpsExactValue,
  szDecimals?: number,
  isMid = false
): string {
  if (isMissing(price)) {
    return MISSING_DISPLAY;
  }
  const decimals = priceDecimals(price, szDecimals, isMid);
  const value = new BigNumber(price).decimalPlaces(
    decimals,
    BigNumber.ROUND_HALF_UP
  );
  const [whole, fraction] = value.absoluteValue().toFixed(decimals).split('.');
  const grouped = Number(whole).toLocaleString('en-US');
  const sign = value.isNegative() ? '-' : '';
  return `${sign}${stripTrailingZeros(
    fraction ? `${grouped}.${fraction}` : grouped
  )}`;
}

/**
 * Money that is a balance rather than a price: two decimals, except that a
 * whole amount drops the `.00`, which keeps $13.40 intact while showing $100
 * rather than $100.00.
 */
export function formatUsd(value: PerpsExactValue, decimals = 2): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const n = new BigNumber(value).toNumber();
  const sign = n < 0 ? '-' : '';
  const formatted = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}$${formatted.replace(/\.00$/, '')}`;
}

/** Signed money, e.g. "+$21.75" — used for PnL where the sign carries meaning. */
export function formatSignedUsd(value: PerpsExactValue, decimals = 2): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const n = new BigNumber(value).toNumber();
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * A signed change, e.g. "+0.34%". A move too small to survive rounding reads as
 * a flat "0.00%": the plus is withheld once the rendered number is zero, so a
 * market that has not moved does not claim to be up.
 */
export function formatSignedPercent(
  value: PerpsExactValue,
  decimals = 2
): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const n = new BigNumber(value).toNumber();
  const text = n.toFixed(decimals);
  return `${Number(text) > 0 ? '+' : ''}${text}%`;
}

/**
 * A position or order size. Hyperliquid rounds sizes to the market's lot
 * precision, so that is the precision worth showing, with trailing zeros
 * dropped. Without a market to consult, the magnitude decides, which keeps
 * small sizes readable without padding whole ones.
 */
export function formatSize(
  size: BigNumber.Value,
  szDecimals?: number
): string {
  const value = new BigNumber(size || 0);
  if (!value.isFinite() || value.isZero()) {
    return '0';
  }
  const strip = (text: string) =>
    text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  if (szDecimals !== undefined) {
    return strip(value.toFixed(Math.max(0, szDecimals)));
  }
  const abs = value.absoluteValue();
  if (abs.isLessThan(0.01)) {
    return strip(value.toFixed(6));
  }
  if (abs.isLessThan(1)) {
    return strip(value.toFixed(4));
  }
  return strip(value.toFixed(2));
}

/** Format a fractional fee rate for display, e.g. 0.000405 -> "0.0405%". */
export function formatFeeRatePercent(value: PerpsExactValue): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const percent = new BigNumber(value).times(100).toNumber();
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

/**
 * Estimate price impact by consuming the live book in execution order.
 * Returns null when the visible book cannot fill the whole order.
 */
export function estimateMarketSlippagePercent(
  book: PerpsOrderBook,
  size: BigNumber.Value,
  isBuy: boolean
): number | null {
  const requested = new BigNumber(size || 0);
  if (!book || !requested.isFinite() || !requested.isGreaterThan(0)) {
    return null;
  }
  const bestBid = book.bids[0]?.priceExact ?? book.bids[0]?.price;
  const bestAsk = book.asks[0]?.priceExact ?? book.asks[0]?.price;
  if (!bestBid || !bestAsk) {
    return null;
  }
  const midPrice = new BigNumber(bestBid).plus(bestAsk).dividedBy(2);
  const levels = isBuy ? book.asks : book.bids;
  let remaining = requested;
  let notional = new BigNumber(0);
  for (const level of levels) {
    const levelSize = new BigNumber(level.sizeExact ?? level.size);
    const filled = BigNumber.minimum(remaining, levelSize);
    notional = notional.plus(filled.times(level.priceExact ?? level.price));
    remaining = remaining.minus(filled);
    if (remaining.isZero()) {
      break;
    }
  }
  if (remaining.isGreaterThan(0)) {
    return null;
  }
  const averagePrice = notional.dividedBy(requested);
  const directionAdjustedImpact = isBuy
    ? averagePrice.minus(midPrice)
    : midPrice.minus(averagePrice);
  return BigNumber.maximum(
    0,
    directionAdjustedImpact.dividedBy(midPrice).times(100)
  ).toNumber();
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
): string {
  if (!data) {
    return '0';
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
  collateral: BigNumber.Value,
  leverage: number
): number {
  const value = new BigNumber(collateral || 0);
  return value.isFinite() && value.isGreaterThan(0)
    ? value.times(Math.max(1, leverage || 1)).toNumber()
    : 0;
}

/** Apply both account buying power and the exchange's per-asset size cap. */
export function maxOrderNotionalForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide,
  leverage: number,
  executionPrice = data?.markPx
): BigNumber {
  const collateral = new BigNumber(availableToTradeForSide(data, side));
  const notional = collateral.isFinite() && collateral.isGreaterThan(0)
    ? collateral.times(Math.max(1, leverage || 1))
    : new BigNumber(0);
  if (!data) {
    return notional;
  }
  const price = new BigNumber(executionPrice || 0);
  if (!price.isFinite() || !price.isGreaterThan(0)) {
    return notional;
  }
  const sideIndex = side === 'long' ? 0 : 1;
  const positionCap = new BigNumber(data.maxTradeSzs[sideIndex]).times(price);
  // Zero is an authoritative per-side capacity, not a missing value. Only an
  // unavailable execution price above skips conversion from base size to USD.
  return positionCap.isFinite() && positionCap.isGreaterThanOrEqualTo(0)
    ? BigNumber.minimum(notional, positionCap)
    : notional;
}

/** Floor a decimal base size to the market lot without passing through Number. */
export function sizeAtLot(
  size: BigNumber.Value,
  szDecimals: number
): string {
  const value = new BigNumber(size || 0);
  if (!value.isFinite() || !value.isGreaterThan(0)) {
    return '0';
  }
  return value
    .decimalPlaces(Math.max(0, szDecimals), BigNumber.ROUND_FLOOR)
    .toFixed();
}

/**
 * Notional trimmed to what the market's lot size can actually express: sizes
 * floor to `szDecimals`, so the placeable notional is the floored size priced
 * back out. Hyperliquid's percentage buttons land on this value rather than on
 * the raw buying power — at 10x on 4.80 USDC that is 47.95, not 48.00.
 */
export function notionalAtLotSize(
  notional: BigNumber.Value,
  price: BigNumber.Value,
  szDecimals: number
): number {
  const priceValue = new BigNumber(price || 0);
  const notionalValue = new BigNumber(notional || 0);
  if (!priceValue.isFinite() || !priceValue.isGreaterThan(0)) {
    return notionalValue.toNumber();
  }
  return new BigNumber(
    sizeAtLot(notionalValue.dividedBy(priceValue), szDecimals)
  )
    .times(priceValue)
    .toNumber();
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
  /** Requested close notional in USD; ignored when `fullClose` is set. */
  notionalExact: BigNumber.Value;
  szDecimals: number;
  /** Hyperliquid's own taker fee rate. */
  feeRate: BigNumber.Value;
  /** NeoLine's builder fee rate; zero when no builder is configured. */
  builderFeeRate?: BigNumber.Value;
  fullClose: boolean;
}): {
  sizeExact: string;
  releasedMarginExact: string;
  feeExact: string;
  protocolFeeExact: string;
  builderFeeExact: string;
} {
  const {
    position,
    notionalExact,
    szDecimals,
    feeRate,
    builderFeeRate = 0,
    fullClose,
  } = params;
  const positionSize = new BigNumber(position?.sziExact ?? 0).absoluteValue();
  const positionValue = new BigNumber(
    position?.positionValueExact ?? 0
  ).absoluteValue();
  if (!positionSize.isGreaterThan(0) || !positionValue.isGreaterThan(0)) {
    return {
      sizeExact: '0',
      releasedMarginExact: '0',
      feeExact: '0',
      protocolFeeExact: '0',
      builderFeeExact: '0',
    };
  }
  const requestedFraction = fullClose
    ? new BigNumber(1)
    : BigNumber.minimum(
        1,
        BigNumber.maximum(
          0,
          new BigNumber(notionalExact || 0).dividedBy(positionValue)
        )
      );
  const sizeExact = fullClose
    ? positionSize.toFixed()
    : sizeAtLot(positionSize.times(requestedFraction), szDecimals);
  // The lot floor above can only shrink the request, so the realised fraction
  // is what the fee and released margin must follow — not what was asked for.
  const actualFraction = BigNumber.minimum(
    1,
    new BigNumber(sizeExact).dividedBy(positionSize)
  );
  const closedValue = positionValue.times(actualFraction);
  const protocolFee = closedValue.times(feeRate || 0);
  const builderFee = closedValue.times(builderFeeRate || 0);
  return {
    sizeExact,
    releasedMarginExact: new BigNumber(position.marginUsedExact ?? 0)
      .absoluteValue()
      .times(actualFraction)
      .toFixed(),
    feeExact: protocolFee.plus(builderFee).toFixed(),
    protocolFeeExact: protocolFee.toFixed(),
    builderFeeExact: builderFee.toFixed(),
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
  executionPriceExact?: BigNumber.Value | null;
  notionalExact: BigNumber.Value;
  leverage: number;
  isLong: boolean;
  /** Taker fee rate as a fraction, e.g. 0.00045 for 4.5bps. */
  feeRate: BigNumber.Value;
  /** NeoLine's builder fee rate; zero when no builder is configured. */
  builderFeeRate?: BigNumber.Value;
}): PerpsOrderPreview {
  const {
    market,
    executionPriceExact,
    notionalExact,
    leverage,
    isLong,
    feeRate,
    builderFeeRate = 0,
  } = params;
  // A missing two-sided book is not a licence to substitute mark price: the
  // mark can sit outside executable liquidity and must never define an order.
  const price = new BigNumber(executionPriceExact ?? market.midPxExact ?? 0);
  const notional = new BigNumber(notionalExact || 0);
  const lev = new BigNumber(Math.max(1, leverage));
  const hasPrice = price.isFinite() && price.isGreaterThan(0);
  const sizeExact = hasPrice
    ? sizeAtLot(notional.dividedBy(price), market.szDecimals)
    : '0';

  // Maintenance margin fraction is half the initial margin at MAX leverage,
  // regardless of the leverage the user picked for this order.
  const maintenanceFraction = new BigNumber(1).dividedBy(
    new BigNumber(2).times(market.maxLeverage)
  );
  const side = isLong ? 1 : -1;
  const numerator = new BigNumber(1)
    .dividedBy(lev)
    .minus(maintenanceFraction)
    .times(side);
  const denominator = new BigNumber(1).minus(maintenanceFraction.times(side));
  const liquidationPx = price.times(
    new BigNumber(1).minus(numerator.dividedBy(denominator))
  );

  const protocolFee = notional.times(feeRate || 0);
  const builderFee = notional.times(builderFeeRate || 0);

  return {
    notionalExact: notional.toFixed(),
    marginExact: notional.dividedBy(lev).toFixed(),
    sizeExact,
    // No positive estimate means there is nothing to quote. Null says that;
    // zero would claim the position liquidates at a price of nothing.
    liquidationPxExact:
      hasPrice && liquidationPx.isGreaterThan(0)
        ? liquidationPx.toFixed()
        : null,
    feeExact: protocolFee.plus(builderFee).toFixed(),
    protocolFeeExact: protocolFee.toFixed(),
    builderFeeExact: builderFee.toFixed(),
  };
}
