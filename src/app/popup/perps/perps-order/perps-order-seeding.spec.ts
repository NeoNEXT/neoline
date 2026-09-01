import { PerpsAccount } from '@popup/_lib/perps';
import { PerpsOrderFacts, PerpsOrderInput } from './perps-order-composition';
import { seedForm, PerpsOrderUserSetField } from './perps-order-seeding';
import { ethMarket, ethPosition } from '../perps.test-fixture';

const facts = (overrides: Partial<PerpsOrderFacts> = {}): PerpsOrderFacts => ({
  coin: 'ETH',
  market: {
    status: 'ready',
    market: ethMarket({ szDecimals: 4, midPxExact: '2000', maxLeverage: 25 }),
  },
  account: {
    availability: 'live',
    account: null,
    missingDexes: [],
    updatedAt: 1,
  },
  activeAssetData: null,
  feeRates: { takerRate: 0.00045, makerRate: 0.00015, builderRate: 0 },
  ...overrides,
});

const input = (overrides: Partial<PerpsOrderInput> = {}): PerpsOrderInput => ({
  mode: 'open',
  side: 'long',
  orderType: 'market',
  amount: '',
  limitPrice: '',
  leverage: 1,
  slippagePercent: 3,
  activePercent: null,
  ...overrides,
});

/** 交易场所对这个资产上报的容量，含它那一侧的杠杆。 */
const capacity = (leverage: number) => ({
  user: '0xabc',
  coin: 'ETH',
  leverage: { type: 'isolated' as const, value: leverage },
  maxTradeSzs: ['10', '10'] as [string, string],
  availableToTrade: ['1000', '1000'] as [string, string],
  markPxExact: '2000',
  markPx: 2000,
});

/** 一个持有 ETH 多头的账户。 */
const holding = (overrides = {}) =>
  ({
    positions: [
      ethPosition({
        coin: 'ETH',
        isLong: true,
        leverage: 20,
        positionValueExact: '480.125',
        ...overrides,
      }),
    ],
  } as PerpsAccount);

const none = new Set<PerpsOrderUserSetField>();

describe('seedForm 限价', () => {
  it('offers the mid as a starting limit price, quantised to the tick', () => {
    const seed = seedForm(facts(), input(), none, false);

    expect(seed.limitPrice).toBe('2000');
  });

  /**
   * 一次性，不是跟随型：一个跟着中间价跳动的限价输入框，会在用户的光标底下改写他正在
   * 输入的价格。
   */
  it('leaves a limit price that already has a value alone', () => {
    const seed = seedForm(facts(), input({ limitPrice: '1900' }), none, false);

    expect(seed.limitPrice).toBeUndefined();
  });

  it('leaves a limit price the user gave alone even once cleared', () => {
    const touched = new Set<PerpsOrderUserSetField>(['limitPrice']);

    const seed = seedForm(facts(), input({ limitPrice: '' }), touched, false);

    expect(seed.limitPrice).toBeUndefined();
  });
});

describe('seedForm 杠杆', () => {
  it('takes the leverage the exchange reports for this asset', () => {
    const seed = seedForm(
      facts({ activeAssetData: capacity(10) }),
      input(),
      none,
      false
    );

    expect(seed.leverage).toBe(10);
  });

  /** 缺省，不是播种：交易场所的值一到就取而代之，不需要第二个闩锁去记它是不是占位。 */
  it('falls back to a default until the exchange value arrives', () => {
    const seed = seedForm(facts(), input(), none, false);

    expect(seed.leverage).toBe(2);
  });

  it('never proposes more than the market allows', () => {
    const seed = seedForm(
      facts({
        market: {
          status: 'ready',
          market: ethMarket({ maxLeverage: 1, midPxExact: '2000' }),
        },
      }),
      input(),
      none,
      false
    );

    expect(seed.leverage).toBe(1);
  });

  it('ignores an exchange leverage outside what the market allows', () => {
    const seed = seedForm(
      facts({ activeAssetData: capacity(99) }),
      input(),
      none,
      false
    );

    expect(seed.leverage).toBe(2);
  });

  it('leaves the leverage the user chose alone', () => {
    const touched = new Set<PerpsOrderUserSetField>(['leverage']);

    const seed = seedForm(
      facts({ activeAssetData: capacity(10) }),
      input(),
      touched,
      false
    );

    expect(seed.leverage).toBeUndefined();
  });
});

describe('seedForm 平仓', () => {
  const closing = (overrides: Partial<PerpsOrderFacts> = {}) =>
    facts({
      account: {
        availability: 'live',
        account: holding(),
        missingDexes: [],
        updatedAt: 1,
      },
      ...overrides,
    });

  it('stands on the opposite side of the position', () => {
    const seed = seedForm(closing(), input({ mode: 'close' }), none, false);

    expect(seed.side).toBe('short');
  });

  it('takes the leverage the position is already held at', () => {
    const seed = seedForm(closing(), input({ mode: 'close' }), none, false);

    expect(seed.leverage).toBe(20);
  });

  /**
   * 这是过去那个缺陷：`loadMarket` 的杠杆播种没有平仓守卫，行情帧只要晚于账户帧到达，
   * 就把持仓杠杆换成开仓的缺省值。现在缺省只在开仓分支里，平仓根本走不到它。
   */
  it('keeps the position leverage even with no exchange capacity yet', () => {
    const seed = seedForm(
      closing({ activeAssetData: null }),
      input({ mode: 'close' }),
      none,
      false
    );

    expect(seed.leverage).toBe(20);
  });

  /**
   * 跟随型：仓位价值随标记价格在动，而平仓表单默认就是全平 —— 一个停在两分钟前仓位价值上
   * 的金额，是个会让用户签下部分平仓的数字。
   */
  it('follows the position value until the user takes over', () => {
    const first = seedForm(closing(), input({ mode: 'close' }), none, false);
    expect(first.amount).toBe('480.13');
    expect(first.activePercent).toBe(100);

    const moved = closing({
      account: {
        availability: 'live',
        account: holding({ positionValueExact: '512.4' }),
        missingDexes: [],
        updatedAt: 2,
      },
    });
    const second = seedForm(
      moved,
      input({ mode: 'close', amount: '480.13' }),
      none,
      false
    );

    expect(second.amount).toBe('512.40');
  });

  it('stops following once the user has given an amount', () => {
    const touched = new Set<PerpsOrderUserSetField>(['amount']);

    const seed = seedForm(
      closing(),
      input({ mode: 'close', amount: '100' }),
      touched,
      false
    );

    expect(seed.amount).toBeUndefined();
    expect(seed.activePercent).toBeUndefined();
  });

  it('has nothing to seed without a position to close', () => {
    const seed = seedForm(facts(), input({ mode: 'close' }), none, false);

    expect(seed.side).toBeUndefined();
    expect(seed.amount).toBeUndefined();
  });
});

describe('seedForm 不作声的时候', () => {
  it('seeds nothing while the user is reviewing', () => {
    const seed = seedForm(
      facts({ activeAssetData: capacity(10) }),
      input(),
      none,
      true
    );

    expect(seed).toEqual({});
  });

  it('seeds nothing before the market answers', () => {
    const seed = seedForm(
      facts({ market: { status: 'loading' } }),
      input(),
      none,
      false
    );

    expect(seed).toEqual({});
  });

  /**
   * 这才是这个模块存在的理由：过去三条播种规则散在三个订阅回调里，各带各的守卫，
   * 于是「行情先到」和「账户先到」会得出不同的杠杆。现在它是从事实出发的纯映射，
   * 同一组事实只有一个答案。
   */
  it('gives the same answer whichever frame arrived first', () => {
    const all = facts({
      activeAssetData: capacity(10),
      account: {
        availability: 'live',
        account: holding(),
        missingDexes: [],
        updatedAt: 1,
      },
    });

    // 行情先到：先只有 market，再补上账户与容量。
    const marketFirst = seedForm(facts(), input({ mode: 'close' }), none, false);
    const thenRest = seedForm(
      all,
      input({ mode: 'close', ...marketFirst }),
      none,
      false
    );

    // 账户先到：直接就是完整的一组事实。
    const accountFirst = seedForm(all, input({ mode: 'close' }), none, false);

    expect(thenRest.leverage).toBe(accountFirst.leverage);
    expect(thenRest.amount).toBe(accountFirst.amount);
    expect(thenRest.side).toBe(accountFirst.side);
  });
});
