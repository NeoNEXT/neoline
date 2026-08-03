import {
  availableToTradeForSide,
  estimateMarketSlippagePercent,
  formatFillTime,
  maxOrderNotionalForSide,
  previewClosePosition,
  previewOrder,
} from './perps.util';

describe('perps utilities', () => {
  it('estimates market slippage from the weighted book fill', () => {
    const book = {
      coin: 'ETH',
      time: 1,
      bids: [
        { price: 99, size: 4 },
        { price: 98, size: 10 },
      ],
      asks: [
        { price: 101, size: 2 },
        { price: 102, size: 10 },
      ],
    };

    expect(estimateMarketSlippagePercent(book, 4, true)).toBeCloseTo(1.5, 8);
    expect(estimateMarketSlippagePercent(book, 6, false)).toBeCloseTo(
      1.3333333333,
      8
    );
  });

  it('does not estimate slippage beyond the visible book depth', () => {
    const book = {
      coin: 'ETH',
      time: 1,
      bids: [{ price: 99, size: 1 }],
      asks: [{ price: 101, size: 1 }],
    };

    expect(estimateMarketSlippagePercent(book, 2, true)).toBeNull();
  });

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

  it('uses the exact position size when closing all despite rounded USD input', () => {
    const preview = previewClosePosition({
      position: {
        coin: 'ETH',
        szi: -0.01,
        entryPx: 1921.5,
        positionValue: 18.895,
        unrealizedPnl: 0.34,
        returnOnEquity: 0.035,
        liquidationPx: 99829,
        leverage: 2,
        leverageType: 'cross',
        marginUsed: 9.44,
        isLong: false,
      },
      notional: 18.89,
      szDecimals: 4,
      feeRate: 0.00045,
      fullClose: true,
    });

    expect(preview.size).toBe(0.01);
    expect(preview.releasedMargin).toBe(9.44);
    expect(preview.fee).toBeCloseTo(18.895 * 0.00045, 10);
  });

  it('scales size and released margin for a partial close', () => {
    const preview = previewClosePosition({
      position: {
        coin: 'ETH',
        szi: -0.01,
        entryPx: 1921.5,
        positionValue: 18.88,
        unrealizedPnl: 0.34,
        returnOnEquity: 0.035,
        liquidationPx: 99829,
        leverage: 2,
        leverageType: 'cross',
        marginUsed: 9.44,
        isLong: false,
      },
      notional: 9.44,
      szDecimals: 4,
      feeRate: 0.00045,
      fullClose: false,
    });

    expect(preview.size).toBe(0.005);
    expect(preview.releasedMargin).toBe(4.72);
  });

  it('uses the limit execution price for size and liquidation preview', () => {
    const preview = previewOrder({
      market: {
        assetId: 0,
        coin: 'ETH',
        szDecimals: 4,
        maxLeverage: 25,
        onlyIsolated: false,
        markPx: 100,
        oraclePx: 100,
        prevDayPx: 95,
        changePercent: 0,
        dayVolume: 0,
        openInterest: 0,
        funding: 0,
      },
      executionPrice: 80,
      notional: 800,
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
    });

    expect(preview.size).toBe(10);
    expect(preview.margin).toBe(400);
    expect(preview.liquidationPx).toBeLessThan(80);
  });
});
