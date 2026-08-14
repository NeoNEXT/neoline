import { PerpsMarket } from '@popup/_lib/perps';
import { PerpsOrderComponent } from './perps-order.component';

describe('PerpsOrderComponent amount boundaries', () => {
  /** No builder address, so previews quote Hyperliquid's own fee alone. */
  function component(): PerpsOrderComponent {
    return new PerpsOrderComponent(
      null,
      null,
      null,
      null,
      { builderAddress: '' } as any,
      null,
      null,
      null
    );
  }

  function market(
    coin: string,
    price: number,
    szDecimals: number,
    maxLeverage = 25
  ): PerpsMarket {
    return {
      key: `hl:${coin}`,
      assetId: 0,
      dex: '',
      dexAssetIndex: 0,
      coin,
      symbol: coin,
      szDecimals,
      maxLeverage,
      onlyIsolated: false,
      markPxExact: String(price),
      midPxExact: String(price),
      oraclePxExact: String(price),
      prevDayPxExact: String(price),
      changePercentExact: '0',
      dayVolumeExact: '0',
      openInterestSizeExact: '0',
      openInterestExact: '0',
      fundingExact: '0',
    };
  }

  it('allows a rounded 100% notional when its submitted size stays within the cap', () => {
    const value = component();
    const price = 1877.99;
    value.market = market('ETH', price, 4);
    value.activeAssetData = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'isolated', value: 10 },
      maxTradeSzs: ['0.0255', '0.0255'],
      availableToTrade: ['4.8', '4.8'],
      markPxExact: String(price),
      markPx: price,
    };
    value.leverage = 10;
    value.amount = 47.89;

    expect(value.insufficient).toBeFalse();

    value.amount = 48.08;
    expect(value.insufficient).toBeTrue();
  });

  /**
   * A lot worth less than half a cent — 36 of Hyperliquid's markets trade this
   * way — used to lose to the cent rounding: the base is already the largest
   * placeable notional, so rounding its last cent up bought one lot more than
   * the account could cover and 100% disabled its own submit button.
   */
  it('keeps 100% inside the cap on a market whose lot is worth under a cent', () => {
    const value = component();
    const price = 0.002718;
    value.market = market('kPEPE', price, 0);
    value.activeAssetData = {
      user: '0xabc',
      coin: 'kPEPE',
      leverage: { type: 'isolated', value: 10 },
      maxTradeSzs: ['1000000', '1000000'],
      availableToTrade: ['3.7708', '3.7708'],
      markPxExact: String(price),
      markPx: price,
    };
    value.leverage = 10;

    value.setPercent(100);

    // Max applies the confirmed 0.5% reserve before lot quantisation.
    expect(value.amount).toBeLessThanOrEqual(37.706814);
    expect(value.amount).toBeLessThanOrEqual(
      value.theoreticalBuyingPower * 0.995
    );
    expect(value.insufficient).toBeFalse();
    expect(value.canSubmit).toBeTrue();
  });

  it('never sizes a percentage above the notional the lot can express', () => {
    const value = component();
    const price = 0.002718;
    value.market = market('kPEPE', price, 0);
    value.activeAssetData = {
      user: '0xabc',
      coin: 'kPEPE',
      leverage: { type: 'isolated', value: 10 },
      maxTradeSzs: ['1000000', '1000000'],
      availableToTrade: ['3.7708', '3.7708'],
      markPxExact: String(price),
      markPx: price,
    };
    value.leverage = 10;

    [10, 25, 50, 75, 100].forEach((percent) => {
      value.setPercent(percent);
      expect(value.insufficient)
        .withContext(`${percent}% of buying power`)
        .toBeFalse();
    });
  });

  /**
   * Hyperliquid measures its $10 floor against the order it receives, which is
   * the lot-floored size priced back out — $10 of a whole-coin market at $3.33
   * is three coins, or $9.99.
   */
  it('rejects an amount whose lot-floored notional falls under the $10 floor', () => {
    const value = component();
    value.market = market('SOME', 3.33, 0);
    value.amount = 10;

    expect(value.belowMinimum).toBeTrue();
    expect(value.canSubmit).toBeFalse();

    value.amount = 13.32;
    expect(value.belowMinimum).toBeFalse();
  });

  it('exempts a full close from the minimum order notional', () => {
    const value = component();
    value.market = market('SOME', 3.33, 0);
    value.closeMode = true;
    value.position = {
      key: 'hl:SOME',
      dex: '',
      coin: 'SOME',
      symbol: 'SOME',
      sziExact: '1',
      entryPxExact: '3.33',
      positionValueExact: '3.33',
      unrealizedPnlExact: '0',
      returnOnEquityExact: '0',
      liquidationPxExact: null,
      leverage: 5,
      leverageType: 'isolated',
      marginUsedExact: '0.67',
      isLong: true,
    };
    value.setPercent(100);

    expect(value.belowMinimum).toBeFalse();
  });

  it('prices margin and fee off the size that reaches the exchange', () => {
    const value = component();
    value.market = market('SOME', 3.33, 0);
    value.leverage = 2;
    value.amount = 39.9;

    // 11 lots at 3.33 is 36.63, not the 39.90 that was typed.
    expect(value.preview.sizeExact).toBe('11');
    expect(value.preview.marginExact).toBe('18.315');
    expect(value.preview.feeExact).toBe('0.0164835');
  });

  it('blocks increasing a cross-margin position', () => {
    const value = component();
    value.market = market('ETH', 100, 2);
    value.amount = 100;
    value.position = {
      key: 'hl:ETH',
      dex: '',
      coin: 'ETH',
      symbol: 'ETH',
      sziExact: '1',
      entryPxExact: '100',
      positionValueExact: '100',
      unrealizedPnlExact: '0',
      returnOnEquityExact: '0',
      liquidationPxExact: null,
      leverage: 5,
      leverageType: 'cross',
      marginUsedExact: '20',
      isLong: true,
    };

    expect(value.crossPositionUnsupported).toBeTrue();
    expect(value.canSubmit).toBeFalse();
  });

  it('labels an opposite isolated order as an explicit reverse', () => {
    const value = component();
    value.market = market('ETH', 100, 2);
    value.side = 'long';
    value.position = {
      key: 'hl:ETH',
      dex: '',
      coin: 'ETH',
      symbol: 'ETH',
      sziExact: '-0.75',
      entryPxExact: '100',
      positionValueExact: '75',
      unrealizedPnlExact: '0',
      returnOnEquityExact: '0',
      liquidationPxExact: null,
      leverage: 5,
      leverageType: 'isolated',
      marginUsedExact: '15',
      isLong: false,
    };
    value.reviewing = true;

    expect(value.reverseMode).toBeTrue();
    expect(value.ctaLabel).toBe('perpsReverseToLong');
  });
});
