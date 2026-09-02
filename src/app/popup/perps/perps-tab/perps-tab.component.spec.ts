import { PerpsTabComponent } from './perps-tab.component';
import { ethMarket } from '../perps.test-fixture';

// 行的顺序、排序、翻页和搜索现在都在 PerpsMarketListComponent 里，
// 由这个 tab 内嵌；它们的 spec 也跟着搬过去了。
describe('PerpsTabComponent', () => {
  const component = () => new PerpsTabComponent(null, null, null, null, null);

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
    // 由内嵌的市场列表提供，而不是 tab 自己的数据源。
    value.markets = [canonical, hip3];

    expect(
      value.marketFor({ key: 'neol:IWM', symbol: 'IWM' } as any)
    ).toBe(hip3);
  });

  // 账户卡无法为组合保证金账户估值，但仓位是真的，
  // 它们上面的平仓按钮也是真的。
  it('lists positions on a portfolio-margin account it cannot value', () => {
    const value = component();
    value.account = {
      abstractionMode: 'portfolioMargin',
      positions: [{ key: 'hl:ETH', symbol: 'ETH' }],
    } as any;

    expect(value.unsupportedAccountMode).toBeTrue();
    expect(value.hasPositions).toBeTrue();
  });

  it('does not present an unknown account total as zero', () => {
    const value = component();
    value.account = {
      abstractionMode: 'disabled',
      totalBalanceExact: null,
      availableBalanceExact: null,
      positions: [],
    } as any;

    expect(value.accountEquityExact).toBeNull();
    expect(value.availableMarginExact).toBeNull();
    // 已用保证金和它同一行，未知时也得说未知，而不是报一个权威的零。
    expect(value.usedMarginExact).toBeNull();
    expect(value.hasEquity).toBeFalse();
  });

  it('keeps account-wide actions disabled while aggregation is loading', () => {
    const value = component();
    value.account = {
      abstractionMode: 'disabled',
      missingDexes: [],
      positions: [],
    } as any;
    value.accountAvailability = 'loading';

    expect(value.globalActionsDisabled).toBeTrue();
  });
});
