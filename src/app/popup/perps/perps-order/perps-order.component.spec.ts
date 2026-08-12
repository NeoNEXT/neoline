import { PerpsOrderComponent } from './perps-order.component';

describe('PerpsOrderComponent amount boundaries', () => {
  function component(): PerpsOrderComponent {
    return new PerpsOrderComponent(
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );
  }

  it('allows a rounded 100% notional when its submitted size stays within the cap', () => {
    const value = component();
    const price = 1877.99;
    value.market = {
      assetId: 0,
      coin: 'ETH',
      szDecimals: 4,
      maxLeverage: 25,
      onlyIsolated: false,
      markPx: price,
      midPx: price,
      oraclePx: price,
      prevDayPx: price,
      changePercent: 0,
      dayVolume: 0,
      openInterest: 0,
      funding: 0,
    };
    value.activeAssetData = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'isolated', value: 10 },
      maxTradeSzs: [0.0255, 0.0255],
      availableToTrade: [4.8, 4.8],
      markPx: price,
    };
    value.leverage = 10;
    value.amount = 47.89;

    expect(value.insufficient).toBeFalse();

    value.amount = 48.08;
    expect(value.insufficient).toBeTrue();
  });
});
