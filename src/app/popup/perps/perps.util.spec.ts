import {
  availableToTradeForSide,
  formatFillTime,
  maxOrderNotionalForSide,
} from './perps.util';

describe('perps utilities', () => {
  it('formats fill time as M/D HH:mm using local time', () => {
    const time = new Date(2026, 0, 2, 3, 4).getTime();

    expect(formatFillTime(time)).toBe('1/2 03:04');
  });

  it('selects Hyperliquid long and short availability independently', () => {
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 2 },
      maxTradeSzs: [0.5323, 0.5223] as [number, number],
      availableToTrade: [1008.75, 989.78] as [number, number],
      markPx: 1895,
    };

    expect(availableToTradeForSide(data, 'long')).toBe(1008.75);
    expect(availableToTradeForSide(data, 'short')).toBe(989.78);
    expect(maxOrderNotionalForSide(data, 'long')).toBeCloseTo(
      0.5323 * 1895,
      8
    );
  });

  it('preserves the position-reduction allowance when previewing leverage', () => {
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 2 },
      maxTradeSzs: [10, 10] as [number, number],
      availableToTrade: [1008.75, 989.78] as [number, number],
      markPx: 1895,
    };

    expect(availableToTradeForSide(data, 'long', 3)).toBeCloseTo(
      989.78 * 1.5 + (1008.75 - 989.78),
      8
    );
    expect(availableToTradeForSide(data, 'short', 3)).toBeCloseTo(
      989.78 * 1.5,
      8
    );
  });
});
