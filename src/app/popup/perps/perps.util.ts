import {
  PerpsCandle,
  PERPS_PRICE_MAX_DECIMALS,
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

/**
 * Sign test for a protocol decimal, which a template cannot do with `< 0`.
 *
 * A missing value has no sign: `--` is not painted red.
 */
export function isNegativeExact(value: PerpsExactValue): boolean {
  return !isMissing(value) && new BigNumber(value).isLessThan(0);
}

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

/**
 * Trailing zeros a fixed-decimal rendering added but the number does not have.
 *
 * Reserved digits are a capability of the scale, not a claim about this value:
 * a market that can quote four decimals still shows $4 as "4".
 */
export function stripTrailingZeros(text: string): string {
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

/**
 * Decimal places the chart's price axis quotes.
 *
 * The axis has to be able to render every price this market can print, so it
 * follows the market's tick alone — never the decimals the current price
 * happens to carry. A mid that lands exactly on `1.68` has two of them, and an
 * axis that copied that would flatten every candle between 1.6800 and 1.6900
 * onto a single label. Without a market to consult, four decimals reads most
 * perps sensibly.
 */
export function chartPriceDecimals(szDecimals?: number): number {
  return szDecimals === undefined
    ? 4
    : Math.max(0, PERPS_PRICE_MAX_DECIMALS - szDecimals);
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
 *
 * An amount too small to survive rounding reads as `<$0.01` rather than `$0`:
 * a fee or a residue that exists is not the same fact as one that does not, and
 * a user who is told `$0` has been told something untrue.
 */
export function formatUsd(value: PerpsExactValue, decimals = 2): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const amount = new BigNumber(value);
  const sign = amount.isNegative() ? '-' : '';
  const abs = amount.absoluteValue();
  const smallest = new BigNumber(1).shiftedBy(-decimals);
  if (abs.isGreaterThan(0) && abs.isLessThan(smallest)) {
    return `${sign}$<${smallest.toFixed(decimals)}`;
  }
  const formatted = abs.toNumber().toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}$${formatted.replace(/\.00$/, '')}`;
}

/**
 * A spendable balance, rounded DOWN and without a currency symbol.
 *
 * Rounding a balance the usual way can show money that is not there: 10.999
 * rendered as "11.00" invites an amount the transfer will reject. Callers add
 * the `$` or the token symbol, since the same figure serves both. Dust still
 * reads as `<0.01` rather than `0.00` — a balance that exists but cannot be
 * expressed at this precision is not a zero balance.
 */
export function formatBalance(value: PerpsExactValue, decimals = 2): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const amount = new BigNumber(value);
  const sign = amount.isNegative() ? '-' : '';
  const abs = amount.absoluteValue();
  const smallest = new BigNumber(1).shiftedBy(-decimals);
  if (abs.isGreaterThan(0) && abs.isLessThan(smallest)) {
    return `${sign}<${smallest.toFixed(decimals)}`;
  }
  const floored = abs.decimalPlaces(decimals, BigNumber.ROUND_FLOOR);
  const [whole, fraction] = floored.toFixed(decimals).split('.');
  const grouped = Number(whole).toLocaleString('en-US');
  return `${sign}${fraction ? `${grouped}.${fraction}` : grouped}`;
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

/**
 * Amount text cut down to the decimals the destination can carry.
 *
 * This runs on every keystroke of an amount field, so a digit the transfer
 * could not express never reaches the model: it is dropped as it is typed
 * rather than accepted and then explained, the same way the transfer screen's
 * amount field behaves. Anything after the last accepted decimal goes, along
 * with a leading sign or currency mark and any second decimal point.
 */
export function clampDecimals(value: string, decimals: number): string {
  const places = Math.max(0, Math.floor(decimals) || 0);
  const fraction = places > 0 ? `(?:\\.\\d{0,${places}})?` : '';
  return (value || '').replace(
    new RegExp(`^\\D*(\\d*${fraction}).*`),
    '$1'
  );
}

/**
 * An hourly funding rate as a percentage, e.g. 0.000013 -> "0.0013%".
 *
 * Four decimals is a floor rather than a choice: funding is quoted in
 * millionths, and a market charging 0.00003% is not the same fact as one
 * charging nothing. A rate too small to reach the fourth decimal reads as
 * `<0.0001%`, keeping its sign, rather than being flattened to `0.0000%`.
 */
export function formatFundingPercent(value: PerpsExactValue): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const percent = new BigNumber(value).times(100);
  const abs = percent.absoluteValue();
  const floor = new BigNumber(1).shiftedBy(-FUNDING_PERCENT_DECIMALS);
  if (abs.isGreaterThan(0) && abs.isLessThan(floor)) {
    return `${percent.isNegative() ? '-' : ''}<${floor.toFixed(
      FUNDING_PERCENT_DECIMALS
    )}%`;
  }
  return `${percent.toFixed(FUNDING_PERCENT_DECIMALS)}%`;
}

/** Funding is quoted in millionths, so a percentage needs four decimals. */
const FUNDING_PERCENT_DECIMALS = 4;

/**
 * A signed price move, e.g. "+12.35" or "-0.0042" — the amount half of a 24h
 * change, formatted at the same precision as the price it was measured from so
 * the two never disagree about how many digits this market has.
 */
export function formatSignedPrice(
  value: PerpsExactValue,
  szDecimals?: number,
  isMid = false
): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const amount = new BigNumber(value);
  const formatted = formatPrice(amount.absoluteValue(), szDecimals, isMid);
  return `${amount.isNegative() ? '-' : '+'}${formatted}`;
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
