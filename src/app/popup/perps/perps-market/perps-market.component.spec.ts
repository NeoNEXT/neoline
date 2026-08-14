import { PerpsCandle, PerpsMarket } from '@popup/_lib/perps';

import { PerpsMarketComponent } from './perps-market.component';

describe('PerpsMarketComponent live price', () => {
  const market: PerpsMarket = {
    key: 'hl:ETH',
    assetId: 1,
    dex: '',
    dexAssetIndex: 1,
    coin: 'ETH',
    symbol: 'ETH',
    szDecimals: 4,
    maxLeverage: 25,
    onlyIsolated: false,
    markPxExact: '1875.7',
    midPxExact: '1875.75',
    oraclePxExact: '1876',
    prevDayPxExact: '1900',
    changePercentExact: '-1.2789473684',
    dayVolumeExact: '1',
    openInterestSizeExact: '0.0005331343',
    openInterestExact: '1',
    fundingExact: '0',
  };

  const candle = (close: string): PerpsCandle => ({
    t: 1,
    T: 2,
    s: 'ETH',
    i: '15m',
    o: '1875.6',
    c: close,
    h: '1876',
    l: '1875',
    v: '1',
    n: 1,
  });

  it('quotes the live mid and ignores the trailing candle close', () => {
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      null,
      null
    );
    component.market = market;
    // A candle only prints on a trade, so it must never set the header price.
    component.candles = [candle('1875.80')];

    expect(component.displayPrice).toBe('1875.75');
    // ETH ticks at two decimals (szDecimals 4) and the mid uses both.
    expect(component.priceDecimals).toBe(2);
    expect(component.displayChangePercent).toBe(market.changePercentExact);

    component.candles = [candle('1876.20')];

    expect(component.displayPrice).toBe('1875.75');
  });

  it('follows the live market stream as new contexts arrive', () => {
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      null,
      null
    );
    component.market = market;
    component.market = {
      ...market,
      midPxExact: '1876.5',
      changePercentExact: '-1.2',
    };

    expect(component.displayPrice).toBe('1876.5');
    expect(component.displayChangePercent).toBe('-1.2');
  });

  it('falls back to the mark when the book reports no mid', () => {
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      null,
      null
    );
    component.market = { ...market, midPxExact: null };

    expect(component.displayPrice).toBe('1875.7');
  });
});
