import { isCandleInterval, perpsIntervalMs } from './perps';

describe('perps candle intervals', () => {
  it('sizes every interval the product offers', () => {
    expect(perpsIntervalMs('1m')).toBe(60e3);
    expect(perpsIntervalMs('5m')).toBe(5 * 60e3);
    expect(perpsIntervalMs('15m')).toBe(15 * 60e3);
    expect(perpsIntervalMs('1h')).toBe(3600e3);
    expect(perpsIntervalMs('12h')).toBe(12 * 3600e3);
    expect(perpsIntervalMs('1d')).toBe(86400e3);
    // Weekly and monthly used to fall through to a one-minute window, which
    // asked for two hours of history and drew an empty chart.
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
    // A label rather than a protocol value, and an interval this build drops.
    expect(isCandleInterval('1D')).toBeFalse();
    expect(isCandleInterval('3d')).toBeFalse();
  });
});
