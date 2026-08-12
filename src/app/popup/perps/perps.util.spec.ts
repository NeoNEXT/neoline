import {
  availableToTradeForSide,
  collateralToNotional,
  estimateMarketSlippagePercent,
  formatFeeRatePercent,
  formatFillTime,
  maxOrderNotionalForSide,
  notionalAtLotSize,
  previewClosePosition,
  previewOrder,
} from './perps.util';
import { PerpsMarket } from '@popup/_lib/perps';

describe('perps utilities', () => {
  it('formats dynamic fee rates without floating-point noise', () => {
    expect(formatFeeRatePercent(0.00045)).toBe('0.045%');
    expect(formatFeeRatePercent(0.000405)).toBe('0.0405%');
    expect(formatFeeRatePercent(0)).toBe('0%');
  });

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
    // The per-asset size cap binds well before the collateral does here.
    expect(maxOrderNotionalForSide(data, 'long', 2)).toBeCloseTo(
      0.5323 * 1895,
      8
    );
  });

  it('reads availableToTrade as collateral, not as a leverage-scaled notional', () => {
    // Verified against the API: on an account with no position, availableToTrade
    // equals withdrawable exactly while leverage sits at 20x. Previewing another
    // leverage must not move it.
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 20 },
      maxTradeSzs: [1e9, 1e9] as [number, number],
      availableToTrade: [4.8, 4.8] as [number, number],
      markPx: 1925,
    };

    expect(availableToTradeForSide(data, 'long')).toBe(4.8);
    expect(availableToTradeForSide(data, 'short')).toBe(4.8);
  });

  it('turns collateral into buying power with leverage', () => {
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 20 },
      maxTradeSzs: [1e9, 1e9] as [number, number],
      availableToTrade: [4.8, 4.8] as [number, number],
      markPx: 1925,
    };

    // 4.8 USDC at 3x buys 14.4 of notional, so a 10 USDC order fits — the old
    // leverage-scaling rejected it as insufficient margin.
    const max = maxOrderNotionalForSide(data, 'long', 3);
    expect(max).toBeCloseTo(14.4, 8);
    expect(max).toBeGreaterThan(10);

    expect(collateralToNotional(4.8, 10)).toBeCloseTo(48, 8);
    // Leverage below 1x cannot buy more than the collateral itself.
    expect(collateralToNotional(4.8, 0.5)).toBeCloseTo(4.8, 8);
  });

  it('trims the 100% notional to the market lot, as Hyperliquid does', () => {
    // Cross-checked against Hyperliquid's own form: 4.80 USDC at 10x with ETH
    // at 1925.57 shows 47.95, not the raw 48.00 — floor(48/1925.57) to four
    // decimals is 0.0249, which prices back out to 47.9467.
    expect(notionalAtLotSize(48, 1925.57, 4)).toBeCloseTo(0.0249 * 1925.57, 8);
    expect(Number(notionalAtLotSize(48, 1925.57, 4).toFixed(2))).toBe(47.95);

    // A whole-unit market cannot express any fraction of a contract.
    expect(notionalAtLotSize(48, 1925.57, 0)).toBeCloseTo(0, 8);
    // Without a usable price there is nothing to quantise against.
    expect(notionalAtLotSize(48, 0, 4)).toBe(48);
  });

  it('preserves an exchange size cap that is already on an exact lot', () => {
    const price = 1877.75;
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'isolated' as const, value: 10 },
      maxTradeSzs: [0.0255, 0.0255] as [number, number],
      availableToTrade: [4.8, 4.8] as [number, number],
      markPx: price,
    };
    const cappedNotional = maxOrderNotionalForSide(
      data,
      'long',
      10,
      price
    );

    expect(notionalAtLotSize(cappedNotional, price, 4)).toBeCloseTo(
      0.0255 * price,
      10
    );
    expect(notionalAtLotSize(0.0254999 * price, price, 4)).toBeCloseTo(
      0.0254 * price,
      10
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
      market: ethMarket(),
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

  it('falls back to the mid, not the mark, without an execution price', () => {
    // The mark can sit outside the spread; the mid is what a market order is
    // actually priced from, so it must be what sizing falls back to.
    const preview = previewOrder({
      market: ethMarket({ markPx: 100, midPx: 80 }),
      notional: 800,
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
    });

    expect(preview.size).toBe(10);

    // A market with no mid (an empty book) still prices off the mark.
    expect(
      previewOrder({
        market: ethMarket({ markPx: 100, midPx: 0 }),
        notional: 800,
        leverage: 2,
        isLong: true,
        feeRate: 0.00045,
      }).size
    ).toBe(8);
  });

  it('adds the builder fee to the exchange fee and reports both', () => {
    const preview = previewOrder({
      market: ethMarket(),
      notional: 1000,
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
      builderFeeRate: 0.00045,
    });

    expect(preview.protocolFee).toBeCloseTo(0.45, 10);
    expect(preview.builderFee).toBeCloseTo(0.45, 10);
    expect(preview.fee).toBeCloseTo(0.9, 10);
  });

  it('charges no builder fee when none is configured', () => {
    const preview = previewOrder({
      market: ethMarket(),
      notional: 1000,
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
    });

    expect(preview.builderFee).toBe(0);
    expect(preview.fee).toBeCloseTo(preview.protocolFee, 10);
  });

  it('charges the builder fee on a close as well', () => {
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
      builderFeeRate: 0.00045,
      fullClose: true,
    });

    expect(preview.protocolFee).toBeCloseTo(18.895 * 0.00045, 10);
    expect(preview.builderFee).toBeCloseTo(18.895 * 0.00045, 10);
    expect(preview.fee).toBeCloseTo(18.895 * 0.0009, 10);
  });
});

function ethMarket(overrides: Partial<PerpsMarket> = {}): PerpsMarket {
  return {
    assetId: 0,
    coin: 'ETH',
    szDecimals: 4,
    maxLeverage: 25,
    onlyIsolated: false,
    markPx: 100,
    midPx: 100,
    oraclePx: 100,
    prevDayPx: 95,
    changePercent: 0,
    dayVolume: 0,
    openInterest: 0,
    funding: 0,
    ...overrides,
  };
}
