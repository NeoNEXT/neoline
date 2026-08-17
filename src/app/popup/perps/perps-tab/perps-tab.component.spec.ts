import { PerpsMarket } from '@popup/_lib/perps';

import { PerpsTabComponent } from './perps-tab.component';

// Row order, sorting, paging and search now live in PerpsMarketListComponent,
// which the tab embeds; their specs moved with them.
describe('PerpsTabComponent', () => {
  const market = (overrides: Partial<PerpsMarket> = {}): PerpsMarket => ({
    key: 'hl:ETH',
    assetId: 4,
    dex: '',
    dexAssetIndex: 4,
    coin: 'ETH',
    symbol: 'ETH',
    szDecimals: 4,
    maxLeverage: 25,
    onlyIsolated: false,
    markPxExact: '1885.8',
    midPxExact: '1885.7',
    oraclePxExact: '1884.4',
    prevDayPxExact: '1884.5',
    changePercentExact: '0.0636',
    dayVolumeExact: '1563608.19928',
    openInterestSizeExact: '1346.6006',
    openInterestExact: '2539501',
    fundingExact: '0.0000125',
    ...overrides,
  });

  const component = () => new PerpsTabComponent(null, null, null);

  it('locates a position market by key so HIP-3 namesakes stay apart', () => {
    const value = component();
    const canonical = market({ key: 'hl:IWM', coin: 'IWM', symbol: 'IWM' });
    const hip3 = market({
      key: 'neol:IWM',
      dex: 'neol',
      coin: 'neol:IWM',
      symbol: 'IWM',
      szDecimals: 2,
    });
    // Supplied by the embedded market list rather than a feed of the tab's own.
    value.markets = [canonical, hip3];

    expect(
      value.marketFor({ key: 'neol:IWM', symbol: 'IWM' } as any)
    ).toBe(hip3);
  });
});
