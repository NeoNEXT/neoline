import {
  isCandleInterval,
  perpsIntervalMs,
  perpsSizeAtLot,
  resolvePerpsTestnet,
} from './perps';

describe('perps candle intervals', () => {
  it('sizes every interval the product offers', () => {
    expect(perpsIntervalMs('1m')).toBe(60e3);
    expect(perpsIntervalMs('5m')).toBe(5 * 60e3);
    expect(perpsIntervalMs('15m')).toBe(15 * 60e3);
    expect(perpsIntervalMs('1h')).toBe(3600e3);
    expect(perpsIntervalMs('12h')).toBe(12 * 3600e3);
    expect(perpsIntervalMs('1d')).toBe(86400e3);
    // 周线和月线过去会落到一分钟的窗口上，于是只请求了两小时的历史，
    // 画出一张空图。
    expect(perpsIntervalMs('1w')).toBe(7 * 86400e3);
    expect(perpsIntervalMs('1M')).toBe(30 * 86400e3);
  });

  it('keeps the month and the minute apart', () => {
    expect(perpsIntervalMs('1M')).not.toBe(perpsIntervalMs('1m'));
  });

  it('refuses an interval it cannot size rather than guessing minutes', () => {
    expect(() => perpsIntervalMs('1y' as any)).toThrowError(
      /Unsupported Hyperliquid candle interval/
    );
  });

  it('reads a protocol value as a membership test, never a normalisation', () => {
    expect(isCandleInterval('1M')).toBeTrue();
    expect(isCandleInterval('1m')).toBeTrue();
    // 这是一个标签而非协议值，而且是本版本不提供的周期。
    expect(isCandleInterval('1D')).toBeFalse();
    expect(isCandleInterval('3d')).toBeFalse();
  });
});

describe('resolvePerpsTestnet', () => {
  it('uses the configured network in local builds', () => {
    expect(resolvePerpsTestnet('mainnet', false)).toBeFalse();
    expect(resolvePerpsTestnet('testnet', false)).toBeTrue();
  });

  it('always selects mainnet in production builds', () => {
    expect(resolvePerpsTestnet('mainnet', true)).toBeFalse();
    expect(resolvePerpsTestnet('testnet', true)).toBeFalse();
  });
});

describe('perpsSizeAtLot', () => {
  it('floors to the market lot, never rounds up', () => {
    // 向上取整会下出一笔比用户所选更大的订单。
    expect(perpsSizeAtLot('0.02499', 4)).toBe('0.0249');
    expect(perpsSizeAtLot('0.02491', 4)).toBe('0.0249');
    expect(perpsSizeAtLot('10.5', 0)).toBe('10');
  });

  /**
   * 这个数量会回流进签名，所以整条路径都不经过 `Number`（ADR-0001）：
   * `0.025599999999999999` 走一趟双精度会变成 `0.0256`，于是下的订单比用户选的更大。
   */
  it('truncates the decimals without going through a float', () => {
    expect(perpsSizeAtLot('0.025599999999999999', 4)).toBe('0.0255');
    expect(perpsSizeAtLot('24836370.4400000013', 4)).toBe('24836370.44');
  });

  it('answers zero for anything that is not a positive size', () => {
    expect(perpsSizeAtLot('0', 4)).toBe('0');
    expect(perpsSizeAtLot('-1', 4)).toBe('0');
    expect(perpsSizeAtLot('abc', 4)).toBe('0');
    expect(perpsSizeAtLot('', 4)).toBe('0');
    // 不足一手就是没有数量，而不是一个很小的数量。
    expect(perpsSizeAtLot('0.5', 0)).toBe('0');
  });

  it('treats a negative lot precision as whole units', () => {
    expect(perpsSizeAtLot('10.9', -2)).toBe('10');
  });
});
