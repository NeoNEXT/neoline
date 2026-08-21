import { PerpsCandle, PerpsMarket } from '@popup/_lib/perps';

/**
 * The market and the candle every perps spec starts from.
 *
 * `PerpsMarket` has nineteen required fields, and a given test cares about two
 * or three of them. Hand-copying the other sixteen into each spec is what made
 * adding `changeAmountExact` a one-line edit in three files at once; keeping the
 * boilerplate here lets a spec state only the values its assertions rest on.
 */

/**
 * ETH at a round $100 — the arithmetic a preview does to it stays checkable by
 * eye, so a test can assert `800` at 2x becomes 10 ETH without a calculator.
 */
export function ethMarket(overrides: Partial<PerpsMarket> = {}): PerpsMarket {
  return {
    key: 'hl:ETH',
    assetId: 0,
    dex: '',
    dexAssetIndex: 0,
    coin: 'ETH',
    symbol: 'ETH',
    szDecimals: 4,
    maxLeverage: 25,
    onlyIsolated: false,
    markPxExact: '100',
    midPxExact: '100',
    oraclePxExact: '100',
    prevDayPxExact: '95',
    changePercentExact: '0',
    changeAmountExact: '0',
    dayVolumeExact: '0',
    openInterestSizeExact: '0',
    openInterestExact: '0',
    fundingExact: '0',
    ...overrides,
  };
}

/**
 * One closed minute of ETH.
 *
 * The timestamp is a real millisecond epoch rather than a small integer: the
 * chart divides it down to the exchange's UTC seconds, and a `t` of 1 cannot
 * tell a correct conversion from a missing one.
 */
export function ethCandle(overrides: Partial<PerpsCandle> = {}): PerpsCandle {
  return {
    t: 1_700_000_000_000,
    T: 1_700_000_059_999,
    s: 'ETH',
    i: '1m',
    o: '90',
    c: '100',
    h: '105',
    l: '85',
    v: '2',
    n: 10,
    ...overrides,
  };
}
