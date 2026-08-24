import { PerpsMarket } from '@popup/_lib/perps';
import { PerpsOrderComponent } from './perps-order.component';
import { formatPrice } from '../perps.util';
import { ethMarket } from '../perps.test-fixture';

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

  /** One market quoted flat at `price`, so a preview's arithmetic is visible. */
  function market(
    coin: string,
    price: number,
    szDecimals: number,
    maxLeverage = 25
  ): PerpsMarket {
    return ethMarket({
      key: `hl:${coin}`,
      coin,
      symbol: coin,
      szDecimals,
      maxLeverage,
      markPxExact: String(price),
      midPxExact: String(price),
      oraclePxExact: String(price),
      prevDayPxExact: String(price),
    });
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
    value.amount = '47.89';

    expect(value.insufficient).toBeFalse();

    value.amount = '48.08';
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
    value.marketStatus = 'ready';
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
    expect(Number(value.amount)).toBeLessThanOrEqual(37.706814);
    expect(Number(value.amount)).toBeLessThanOrEqual(
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
    value.amount = '10';

    expect(value.belowMinimum).toBeTrue();
    expect(value.canSubmit).toBeFalse();

    value.amount = '13.32';
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
    value.amount = '39.9';

    // 11 lots at 3.33 is 36.63, not the 39.90 that was typed.
    expect(value.preview.sizeExact).toBe('11');
    expect(value.preview.marginExact).toBe('18.315');
    expect(value.preview.feeExact).toBe('0.0164835');
  });

  /**
   * The summary is on screen from the moment the form is, so an empty amount
   * box has to read as "no order yet" rather than as a zero-value order.
   */
  it('reads N/A on every summary row before an amount is typed', () => {
    const value = component();
    value.market = market('ETH', 2000, 4);
    value.leverage = 10;

    expect(value.preview).toBeNull();
    expect(value.liquidationPriceText).toBe('N/A');
    expect(value.marginText).toBe('N/A');
    // The rate is known without an order; only its cost is not.
    expect(value.feeText).toBe('0.045%');
  });

  it('quotes the order once an amount is typed', () => {
    const value = component();
    value.market = market('ETH', 2000, 4);
    value.leverage = 10;
    value.amount = '200';

    expect(value.liquidationPriceText).toBe(
      `$${formatPrice(value.preview.liquidationPxExact, 4)}`
    );
    expect(value.marginText).toBe('$20');
    // The fee's cash amount, not the `--` an absent field used to render.
    expect(value.feeText).toBe('0.045% ($0.09)');
  });

  /**
   * A market order crosses and pays taker. A GTC limit order usually rests and
   * fills as maker, so quoting only the taker rate overstates what it costs —
   * and on a rebate tier it gets the sign of the answer wrong.
   */
  describe('fee sides', () => {
    function priced(): PerpsOrderComponent {
      const value = component();
      value.market = market('ETH', 2000, 4);
      value.leverage = 10;
      value.amount = '200';
      return value;
    }

    it('quotes the taker rate alone for a market order', () => {
      const value = priced();

      expect(value.quotesBothFeeSides).toBeFalse();
      expect(value.feeText).toBe('0.045% ($0.09)');
    });

    it('quotes both sides for a limit order', () => {
      const value = priced();
      value.orderType = 'limit';
      value.limitPrice = '2000';

      expect(value.quotesBothFeeSides).toBeTrue();
      expect(value.makerFeeText).toBe('0.015% ($0.03)');
      expect(value.feeText).toBe('0.045% ($0.09)');
      expect(value.makerFeeIsRebate).toBeFalse();
    });

    // A rebate pays the account. Showing it as "$0.00" would delete money the
    // fill actually returns, so the sign is carried all the way to the row.
    it('shows a negative maker rate as a rebate rather than zero', () => {
      const value = priced();
      value.orderType = 'limit';
      value.limitPrice = '2000';
      (value as any).makerFeeRate = -0.00002;

      expect(value.makerFeeIsRebate).toBeTrue();
      expect(value.makerFeeText).toBe('-0.002% (-$<0.01)');
    });

    // Both rows quote what leaves the account, so NeoLine's cut is in each.
    it('includes the builder fee on both sides', () => {
      const value = new PerpsOrderComponent(
        null,
        null,
        null,
        null,
        { builderAddress: '0xbuilder' } as any,
        null,
        null,
        null
      );
      value.market = market('ETH', 2000, 4);
      value.leverage = 10;
      value.amount = '200';
      value.orderType = 'limit';
      value.limitPrice = '2000';

      expect(value.makerFeeText).toBe('0.06% ($0.12)');
      expect(value.feeText).toBe('0.09% ($0.18)');
    });
  });

  it('blocks increasing a cross-margin position', () => {
    const value = component();
    value.market = market('ETH', 100, 2);
    value.amount = '100';
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

  /**
   * The exchange has no flip order: a reverse is |position| + amount on one
   * ticket. Reading a plain opposite-side order as one signs several times the
   * risk the form previewed, so the page asks what was meant instead.
   */
  it('refuses to read an opposite-side order as a reverse', () => {
    const value = component();
    value.marketStatus = 'ready';
    value.market = market('ETH', 100, 2);
    value.side = 'long';
    value.amount = '20';
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

    expect(value.oppositePositionHeld).toBeTrue();
    expect(value.orderUnavailableReason).toBe('perpsHoldingShortChooseExit');
    expect(value.canSubmit).toBeFalse();

    // The button never offers a reverse from this page, even in review.
    value.reviewing = true;
    expect(value.ctaLabel).toBe('perpsLong');
  });

  it('adds to a position held on the same side', () => {
    const value = component();
    value.marketStatus = 'ready';
    value.market = market('ETH', 100, 2);
    value.side = 'long';
    value.amount = '20';
    value.activeAssetData = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'isolated', value: 1 },
      maxTradeSzs: ['100', '100'],
      availableToTrade: ['1000', '1000'],
      markPxExact: '100',
      markPx: 100,
    };
    value.position = {
      key: 'hl:ETH',
      dex: '',
      coin: 'ETH',
      symbol: 'ETH',
      sziExact: '0.75',
      entryPxExact: '100',
      positionValueExact: '75',
      unrealizedPnlExact: '0',
      returnOnEquityExact: '0',
      liquidationPxExact: '60',
      leverage: 5,
      leverageType: 'isolated',
      marginUsedExact: '15',
      isLong: true,
    };

    expect(value.oppositePositionHeld).toBeFalse();
    expect(value.increasesPosition).toBeTrue();
    expect(value.orderUnavailableReason).toBeNull();
    // The exchange's own figure is shown beside the estimate.
    expect(value.showsCurrentLiquidationPrice).toBeTrue();
    expect(value.currentLiquidationPriceText).toBe('$60');
  });
});

describe('PerpsOrderComponent account modes', () => {
  const component = () =>
    new PerpsOrderComponent(
      null,
      null,
      null,
      null,
      { builderAddress: '' } as any,
      null,
      null,
      null
    );

  /**
   * Portfolio Margin's account figures are unusable, so an order that adds risk
   * cannot be sized or previewed. Closing reads the position instead, and a
   * position the user cannot exit from here is the one outcome worth avoiding.
   */
  /**
   * The deployer's share on a HIP-3 market is not reported anywhere, so the fee
   * row must say so rather than quote the canonical rate — but it must not stop
   * the order, which the fee does not change.
   */
  it('declines to quote a fee on a HIP-3 market without blocking the order', () => {
    const value = component();

    value.market = ethMarket({ key: 'hl:ETH', coin: 'ETH', symbol: 'ETH' });
    expect(value.feeEstimateUnavailable).toBeFalse();

    value.market = ethMarket({
      key: 'xyz:ETH',
      dex: 'xyz',
      coin: 'xyz:ETH',
      symbol: 'ETH',
    });
    expect(value.feeEstimateUnavailable).toBeTrue();
    expect(value.unsupportedAccountMode).toBeFalse();
  });

  it('bars a portfolio-margin account from opening but not from closing', () => {
    const value = component();
    value.account = { abstractionMode: 'portfolioMargin' } as any;

    expect(value.unsupportedAccountMode).toBeTrue();

    value.closeMode = true;

    expect(value.unsupportedAccountMode).toBeFalse();
  });
});
