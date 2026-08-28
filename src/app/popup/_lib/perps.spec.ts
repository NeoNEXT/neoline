import {
  isCandleInterval,
  perpsIntervalMs,
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
