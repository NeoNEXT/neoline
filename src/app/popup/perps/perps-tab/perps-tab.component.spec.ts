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

  // 本产品对两种模式展示同一套 USDC 金额，不代表完整组合估值。这一页因此不认账户模式：
  // 权益、可用余额和出入金入口都照常，不再有一条只对 portfolioMargin 生效的分支。
  it('values a portfolio-margin account exactly like a unified one', () => {
    const value = component();
    const state = {
      totalBalanceExact: '1250.5',
      availableBalanceExact: '900.25',
      positions: [{ key: 'hl:ETH', symbol: 'ETH' }],
      missingDexes: [],
    };
    value.accountAvailability = 'live' as any;

    value.account = { ...state, abstractionMode: 'unifiedAccount' } as any;
    const unified = {
      equity: value.accountEquityExact,
      available: value.availableMarginExact,
      actionsDisabled: value.globalActionsDisabled,
    };

    value.account = { ...state, abstractionMode: 'portfolioMargin' } as any;

    expect(value.accountEquityExact).toBe(unified.equity);
    expect(value.availableMarginExact).toBe(unified.available);
    expect(value.globalActionsDisabled).toBe(unified.actionsDisabled);
    expect(value.globalActionsDisabled).toBeFalse();
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
