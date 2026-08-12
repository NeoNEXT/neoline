import { PerpsCandle, PerpsMarket } from '@popup/_lib/perps';

import { PerpsMarketComponent } from './perps-market.component';

describe('PerpsMarketComponent live price', () => {
  const market: PerpsMarket = {
    assetId: 1,
    coin: 'ETH',
    szDecimals: 4,
    maxLeverage: 25,
    onlyIsolated: false,
    markPx: 1875.7,
    midPx: 1875.75,
    oraclePx: 1876,
    prevDayPx: 1900,
    changePercent: ((1875.7 - 1900) / 1900) * 100,
    dayVolume: 1,
    openInterest: 1,
    funding: 0,
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

    expect(component.displayPrice).toBe(1875.75);
    expect(component.priceDecimals).toBe(1);
    expect(component.displayChangePercent).toBe(market.changePercent);

    component.candles = [candle('1876.20')];

    expect(component.displayPrice).toBe(1875.75);
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
    component.market = { ...market, midPx: 1876.5, changePercent: -1.2 };

    expect(component.displayPrice).toBe(1876.5);
    expect(component.displayChangePercent).toBe(-1.2);
  });

  it('falls back to the mark when the book reports no mid', () => {
    const component = new PerpsMarketComponent(
      null,
      null,
      null,
      null,
      null
    );
    component.market = { ...market, midPx: 0 };

    expect(component.displayPrice).toBe(1875.7);
  });
});
