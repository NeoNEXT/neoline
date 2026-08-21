import { PerpsTabComponent } from './perps-tab.component';
import { ethMarket } from '../perps.test-fixture';

// Row order, sorting, paging and search now live in PerpsMarketListComponent,
// which the tab embeds; their specs moved with them.
describe('PerpsTabComponent', () => {
  const component = () => new PerpsTabComponent(null, null, null);

  it('locates a position market by key so HIP-3 namesakes stay apart', () => {
    const value = component();
    const canonical = ethMarket({ key: 'hl:IWM', coin: 'IWM', symbol: 'IWM' });
    const hip3 = ethMarket({
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
