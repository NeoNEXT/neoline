import { PerpsCandle, PerpsMarket, PerpsPosition } from '@popup/_lib/perps';

/**
 * 所有 perps 测试的共同起点：一个市场和一根 K 线。
 *
 * `PerpsMarket` 有十九个必填字段，而一个具体的测试只关心其中两三个。把另外十六个手抄进
 * 每个 spec，正是当初新增 `changeAmountExact` 时要同时在三个文件里各改一行的原因；把这些
 * 样板放在这里，spec 就只需写出它的断言真正依赖的那几个值。
 */

/**
 * ETH 取整数 $100 —— 这样预览对它做的算术一眼就能验算，
 * 测试可以断言 `800` 在 2 倍杠杆下变成 10 ETH，不用按计算器。
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
    marginMode: null,
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
 * ETH 的一根已收盘的分钟线。
 *
 * 时间戳用的是真实的毫秒时间戳，而不是一个小整数：图表会把它换算成交易场所的 UTC 秒，
 * 而 `t` 取 1 的话，正确的换算和漏掉换算根本分不出来。
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

/**
 * ETH 上一个小额空头仓位，全仓。
 *
 * 刻意不与 `ethMarket` 镜像对称：仓位的数字与市场的不同，断言在读哪一个就一目了然。
 */
export function ethPosition(
  overrides: Partial<PerpsPosition> = {}
): PerpsPosition {
  return {
    key: 'hl:ETH',
    dex: '',
    coin: 'ETH',
    symbol: 'ETH',
    sziExact: '-0.01',
    entryPxExact: '1921.5',
    positionValueExact: '18.895',
    unrealizedPnlExact: '0.34',
    returnOnEquityExact: '0.035',
    liquidationPxExact: '99829',
    leverage: 2,
    leverageType: 'cross',
    marginUsedExact: '9.44',
    isLong: false,
    ...overrides,
  };
}
