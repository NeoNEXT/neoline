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

  // The account card cannot price a portfolio-margin account, but the positions
  // are real and so is the close button on them.
  it('lists positions on a portfolio-margin account it cannot value', () => {
    const value = component();
    value.account = {
      abstractionMode: 'portfolioMargin',
      positions: [{ key: 'hl:ETH', symbol: 'ETH' }],
    } as any;

    expect(value.unsupportedAccountMode).toBeTrue();
    expect(value.hasPositions).toBeTrue();
  });
});
