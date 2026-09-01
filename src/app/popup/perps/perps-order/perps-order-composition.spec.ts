import {
  PerpsAccount,
  PerpsActiveAssetData,
  PerpsPosition,
} from '@popup/_lib/perps';
import {
  amountForPercent,
  composeOrder,
  intentUnchanged,
  normalizeLimitPrice,
  withinReviewedSlippage,
  PerpsOrderFacts,
  PerpsOrderInput,
  PerpsOrderMarketFacts,
  PerpsReviewBaseline,
} from './perps-order-composition';
import { ethMarket, ethPosition } from '../perps.test-fixture';

const facts = (overrides: Partial<PerpsOrderFacts> = {}): PerpsOrderFacts => ({
  coin: 'ETH',
  market: { status: 'ready', market: ethMarket() },
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

/** 一个价格恒为 `price` 的市场，好让预览的算术一目了然。 */
const priced = (
  coin: string,
  price: number,
  szDecimals: number,
  maxLeverage = 25
): PerpsOrderMarketFacts => ({
  status: 'ready',
  market: ethMarket({
    key: `hl:${coin}`,
    coin,
    symbol: coin,
    szDecimals,
    maxLeverage,
    markPxExact: String(price),
    midPxExact: String(price),
    oraclePxExact: String(price),
    prevDayPxExact: String(price),
  }),
});

const capacity = (
  coin: string,
  price: number,
  available: string,
  maxSz: string,
  leverage = 10
): PerpsActiveAssetData => ({
  user: '0xabc',
  coin,
  leverage: { type: 'isolated', value: leverage },
  maxTradeSzs: [maxSz, maxSz],
  availableToTrade: [available, available],
  markPxExact: String(price),
  markPx: price,
});

const account = (overrides: Partial<PerpsAccount> = {}): PerpsAccount =>
  ({ positions: [], ...overrides } as PerpsAccount);

const reason = (f: PerpsOrderFacts, i: PerpsOrderInput) =>
  composeOrder(f, i).availability?.code ?? null;

/** 一份持有这些仓位的账户状态。 */
const withPositions = (...positions: PerpsPosition[]) => ({
  availability: 'live' as const,
  account: account({ positions }),
  missingDexes: [] as string[],
  updatedAt: 1,
});

/** 交易场所按方向分别上报的容量；`capacity` 两侧同值，这个不是。 */
const sides = (
  price: number,
  availableToTrade: [string, string],
  maxTradeSzs: [string, string],
  leverage = 10
): PerpsActiveAssetData => ({
  user: '0xabc',
  coin: 'ETH',
  leverage: { type: 'isolated', value: leverage },
  maxTradeSzs,
  availableToTrade,
  markPxExact: String(price),
  markPx: price,
});

/**
 * 购买力：交易场所上报的容量如何变成百分比按钮所度量的基数。
 *
 * 这些规则过去各自直接调 `availableToTradeForSide` / `collateralToNotional` /
 * `maxOrderNotionalForSide` / `notionalAtLotSize` 来断言。它们现在是 `composeOrder` 的实现，
 * 所以断言改从 `availableExact` 和 `percentBase` 上读 —— 那才是页面看得见的东西。
 */
describe('composeOrder 购买力', () => {
  it('reads each side of the exchange capacity independently', () => {
    const f = facts({
      market: priced('ETH', 1895, 4),
      activeAssetData: sides(
        1895,
        ['1008.75', '989.78'],
        ['0.5323', '0.5223'],
        2
      ),
    });

    expect(composeOrder(f, input({ side: 'long' })).availableExact).toBe(
      '1008.75'
    );
    expect(composeOrder(f, input({ side: 'short' })).availableExact).toBe(
      '989.78'
    );
    // 这里按单资产的数量上限先卡住，远早于抵押品卡住它。
    expect(
      composeOrder(f, input({ side: 'long', leverage: 2 })).percentBase
    ).toBeCloseTo(0.5323 * 1895, 6);
  });

  it('reads availableToTrade as collateral, not as a leverage-scaled notional', () => {
    // 已对照 API 验证：在没有仓位的账户上，杠杆处于 20 倍时 availableToTrade 与
    // withdrawable 完全相等。预览另一个杠杆不能让它变动。
    const f = facts({
      market: priced('ETH', 1925, 4),
      activeAssetData: capacity('ETH', 1925, '4.8', '1000000000', 20),
    });

    expect(composeOrder(f, input({ leverage: 3 })).availableExact).toBe('4.8');
    expect(composeOrder(f, input({ leverage: 20 })).availableExact).toBe('4.8');
  });

  it('turns collateral into buying power with leverage', () => {
    const f = facts({
      market: priced('ETH', 100, 4),
      activeAssetData: capacity('ETH', 100, '4.8', '1000000000', 20),
    });

    // 4.8 USDC 在 3 倍杠杆下能买 14.4 的名义价值，所以一笔 10 USDC 的订单放得下 ——
    // 旧的按杠杆缩放会把它当成保证金不足而拒绝。
    expect(composeOrder(f, input({ leverage: 3 })).percentBase).toBeCloseTo(
      14.4,
      6
    );
    expect(reason(f, input({ leverage: 3, amount: '10' }))).toBeNull();
    // 低于 1 倍的杠杆，买不到比抵押品本身更多的东西。
    expect(composeOrder(f, input({ leverage: 0.5 })).percentBase).toBeCloseTo(
      4.8,
      6
    );
  });

  it('trims the 100% notional to the market lot, as Hyperliquid does', () => {
    // 与 Hyperliquid 自己的表单交叉核对过：4.80 USDC、10 倍杠杆、ETH 在 1925.57 时显示的
    // 是 47.95 而不是原始的 48.00 —— floor(48/1925.57) 取四位小数是 0.0249，
    // 再乘回价格得到 47.9467。
    const f = facts({
      market: priced('ETH', 1925.57, 4),
      activeAssetData: capacity('ETH', 1925.57, '4.8', '1000000000', 10),
    });

    expect(
      Number(composeOrder(f, input({ leverage: 10 })).percentBase.toFixed(2))
    ).toBe(47.95);

    // 只能整数计量的市场，表达不了合约的任何小数部分。
    const whole = facts({
      market: priced('ETH', 1925.57, 0),
      activeAssetData: capacity('ETH', 1925.57, '4.8', '1000000000', 10),
    });
    expect(composeOrder(whole, input({ leverage: 10 })).percentBase).toBe(0);
  });

  it('preserves an exchange size cap that is already on an exact lot', () => {
    const price = 1877.75;
    const onLot = facts({
      market: priced('ETH', price, 4),
      activeAssetData: capacity('ETH', price, '4.8', '0.0255', 10),
    });

    expect(
      composeOrder(onLot, input({ leverage: 10 })).percentBase
    ).toBeCloseTo(0.0255 * price, 10);

    // 差一点点没到下一手，就落回上一手。
    const justUnder = facts({
      market: priced('ETH', price, 4),
      activeAssetData: capacity('ETH', price, '4.8', '0.0254999', 10),
    });
    expect(
      composeOrder(justUnder, input({ leverage: 10 })).percentBase
    ).toBeCloseTo(0.0254 * price, 10);
  });

  /**
   * 容量原样来自交易场所，不经过 JavaScript 浮点（ADR-0001）—— 一个把它读成 `number`
   * 的实现，会在这种位数下悄悄改掉最后几位。
   */
  it('keeps the exchange capacity in protocol decimals', () => {
    const f = facts({
      coin: 'APT',
      market: priced('APT', 4.4716, 2),
      activeAssetData: sides(
        4.4716,
        ['37019438.0284740031', '37019438.0284740031'],
        ['24836370.4400000013', '24836370.4400000013'],
        3
      ),
    });

    expect(composeOrder(f, input({ leverage: 3 })).availableExact).toBe(
      '37019438.0284740031'
    );
  });

  it('keeps the raw buying power while there is no execution price yet', () => {
    const f = facts({
      market: priced('ETH', 1895, 4),
      activeAssetData: sides(
        1895,
        ['1008.75', '989.78'],
        ['0.5323', '0.5223'],
        3
      ),
    });

    // 限价单还没填价：单资产上限换不成美元，但抵押品 × 杠杆仍然成立。把它钉成零会让
    // 百分比按钮全都归零 —— 而那意味着「还没加载」，不是「没有容量」。
    expect(
      composeOrder(
        f,
        input({ orderType: 'limit', limitPrice: '', leverage: 3 })
      ).percentBase
    ).toBeCloseTo(3026.25, 6);
  });

  it('treats a zero max trade size as a binding side capacity', () => {
    const f = facts({
      market: priced('ETH', 1895, 4),
      activeAssetData: sides(1895, ['1008.75', '989.78'], ['0', '0.5223'], 3),
    });

    expect(
      composeOrder(f, input({ side: 'long', leverage: 3 })).percentBase
    ).toBe(0);
    // 另一侧仍然有容量。
    expect(
      composeOrder(f, input({ side: 'short', leverage: 3 })).percentBase
    ).toBeGreaterThan(0);
  });
});

/**
 * 预览：保证金、手续费和数量，从 `composeOrder` 的 `preview` 上读。
 */
describe('composeOrder 预览', () => {
  const funded = (price: number, szDecimals = 4, builderRate = 0) =>
    facts({
      market: priced('ETH', price, szDecimals),
      activeAssetData: capacity('ETH', price, '100000', '1000000', 2),
      feeRates: { takerRate: 0.00045, makerRate: 0.00015, builderRate },
    });

  it('prices size and the liquidation estimate off the limit price', () => {
    // 中间价 100，但用户挂在 80 —— 数量和强平估算都必须跟着 80 走。
    const composed = composeOrder(
      funded(100),
      input({
        orderType: 'limit',
        limitPrice: '80',
        amount: '800',
        leverage: 2,
      })
    );

    expect(composed.orderSizeExact).toBe('10');
    expect(composed.preview.marginExact).toBe('400');
    expect(Number(composed.preview.liquidationPxExact)).toBeLessThan(80);
  });

  it('prices a market order off the mid, never the mark', () => {
    // 标记价格可能落在价差之外；市价单实际是按中间价定价的。
    const f = facts({
      market: {
        status: 'ready',
        market: ethMarket({ markPxExact: '100', midPxExact: '80' }),
      },
      activeAssetData: capacity('ETH', 80, '100000', '1000000', 2),
    });

    expect(
      composeOrder(f, input({ amount: '800', leverage: 2 })).orderSizeExact
    ).toBe('10');
  });

  it('refuses to size a market order off the mark when there is no mid', () => {
    const f = facts({
      market: {
        status: 'ready',
        market: ethMarket({ markPxExact: '100', midPxExact: null }),
      },
    });
    const composed = composeOrder(f, input({ amount: '800', leverage: 2 }));

    expect(composed.orderSizeExact).toBe('0');
    expect(composed.availability.code).toBe('no-execution-price');
  });

  it('adds the builder fee to the exchange fee and reports both', () => {
    const { preview } = composeOrder(
      funded(100, 4, 0.00045),
      input({ amount: '1000', leverage: 2 })
    );

    expect(preview.protocolFeeExact).toBe('0.45');
    expect(preview.builderFeeExact).toBe('0.45');
    expect(preview.feeExact).toBe('0.9');
  });

  it('charges no builder fee when none is configured', () => {
    const { preview } = composeOrder(
      funded(100),
      input({ amount: '1000', leverage: 2 })
    );

    expect(preview.builderFeeExact).toBe('0');
    expect(preview.feeExact).toBe(preview.protocolFeeExact);
  });

  it('closes with the exact position size despite a rounded USD amount', () => {
    const f = facts({
      market: priced('ETH', 1889, 4),
      account: withPositions(ethPosition({ positionValueExact: '18.895' })),
    });

    const composed = composeOrder(
      f,
      input({
        mode: 'close',
        side: 'long',
        amount: '18.89',
        activePercent: 100,
      })
    );

    expect(composed.fullClose).toBeTrue();
    // 把两位小数的美元显示值再换算回去会少算一个最小变动单位，留下并非本意的零头。
    expect(composed.orderSizeExact).toBe('0.01');
    expect(composed.preview.sizeExact).toBe('0.01');
    expect(composed.preview.marginExact).toBe('9.44');
    expect(composed.preview.feeExact).toBe('0.00850275');
  });

  it('scales size and released margin for a partial close', () => {
    const f = facts({
      market: priced('ETH', 1889, 4),
      account: withPositions(ethPosition({ positionValueExact: '18.88' })),
    });

    const composed = composeOrder(
      f,
      input({ mode: 'close', side: 'long', amount: '9.44' })
    );

    expect(composed.fullClose).toBeFalse();
    expect(composed.preview.sizeExact).toBe('0.005');
    expect(composed.preview.marginExact).toBe('4.72');
  });

  it('charges the builder fee on a close as well', () => {
    const f = facts({
      market: priced('ETH', 1889, 4),
      account: withPositions(ethPosition({ positionValueExact: '18.895' })),
      feeRates: { takerRate: 0.00045, makerRate: 0.00015, builderRate: 0.00045 },
    });

    const { preview } = composeOrder(
      f,
      input({
        mode: 'close',
        side: 'long',
        amount: '18.89',
        activePercent: 100,
      })
    );

    expect(preview.protocolFeeExact).toBe('0.00850275');
    expect(preview.builderFeeExact).toBe('0.00850275');
    expect(preview.feeExact).toBe('0.0170055');
  });
});

/**
 * 加仓不会新建出第二个仓位。交易场所是对合并后的仓位计算保证金的，所以一个只按这笔
 * 订单单独定价的估算 —— 背后只有它自己的保证金 —— 报出的是一个账户永远不会在那里被
 * 强平的价位。
 */
describe('composeOrder 加仓时的强平估算', () => {
  /** 10 ETH 多头，$100 入场，2 倍杠杆持有 —— 也就是 $500 保证金。 */
  const heldLong = () =>
    ethPosition({
      sziExact: '10',
      entryPxExact: '100',
      positionValueExact: '1000',
      marginUsedExact: '500',
      leverage: 2,
      leverageType: 'isolated',
      isLong: true,
    });

  const at = (
    limitPrice: string,
    position?: PerpsPosition,
    szDecimals = 4,
    amount = '1000'
  ) =>
    composeOrder(
      facts({
        market: priced('ETH', 100, szDecimals),
        activeAssetData: capacity('ETH', 100, '100000', '1000000', 2),
        feeRates: { takerRate: 0, makerRate: 0, builderRate: 0 },
        account: position ? withPositions(position) : facts().account,
      }),
      input({
        orderType: 'limit',
        limitPrice,
        amount,
        leverage: 2,
      })
    );

  const standalone = (limitPrice: string) =>
    Number(at(limitPrice).preview.liquidationPxExact);

  // 以自身的价格和杠杆把仓位翻倍，强平价不会有任何变化 —— 这是最能说明「合并是对整个
  // 仓位做算术，而不是只对这笔订单」的检验。
  it('leaves the level unmoved when the order matches what is held', () => {
    const merged = Number(at('100', heldLong()).preview.liquidationPxExact);

    expect(merged).toBeCloseTo(standalone('100'), 10);
    expect(merged).toBeCloseTo(51.0204, 4);
  });

  // 在更高价位买入会把按数量加权的入场价拉高，所以合并后的价位高于仓位自身的，
  // 又低于这笔订单单独面对的。
  it('weights the entry by size when the order fills higher', () => {
    const merged = Number(at('120', heldLong()).preview.liquidationPxExact);

    expect(merged).toBeGreaterThan(standalone('100'));
    expect(merged).toBeLessThan(standalone('120'));
  });

  // 保证金数字仍然是这笔订单自己的：它是这笔订单锁定的金额，
  // 而不是合并后仓位持有的金额。
  it('still reports the margin this order locks', () => {
    expect(at('100', heldLong()).preview.marginExact).toBe('500');
  });

  // 反方向的订单要么是减仓要么是反手，而下单表单拒绝去猜是哪一种 ——
  // 所以没有东西可供合并。
  it('ignores a position held on the other side', () => {
    const composed = at(
      '100',
      ethPosition({
        sziExact: '-10',
        entryPxExact: '100',
        marginUsedExact: '500',
        leverageType: 'isolated',
        isLong: false,
      })
    );

    expect(Number(composed.preview.liquidationPxExact)).toBeCloseTo(
      standalone('100'),
      10
    );
    // 它也不会被读成反手：表单改为直接问用户本意是什么。
    expect(composed.availability.code).toBe('holding-short');
  });

  // 不足一手就没有订单可以合并，而除以为零的数量
  // 得到的会是一个无穷大而不是一个价格。
  it('falls back to the ratio when the order cannot reach one lot', () => {
    // 只能整数计量的市场上，$50 换不到一整个 ETH。
    const composed = at('100', heldLong(), 0, '50');

    expect(composed.preview.sizeExact).toBe('0');
    expect(Number(composed.preview.liquidationPxExact)).toBeCloseTo(
      51.0204,
      4
    );
  });
});

describe('normalizeLimitPrice', () => {
  it('quantises to the tighter of the tick and five significant figures', () => {
    // 五位有效数字先卡住。
    expect(normalizeLimitPrice('63393.55', 5)).toBe('63394');
    // 最小变动价位先卡住。
    expect(normalizeLimitPrice('75.7565', 2)).toBe('75.757');
    expect(normalizeLimitPrice('0.0029794', 0)).toBe('0.002979');
  });

  it('is a no-op on a price it has already quantised', () => {
    for (const price of ['63393.55', '75.7565', '0.0029794', '1', '0.5']) {
      const once = normalizeLimitPrice(price, 2);
      expect(normalizeLimitPrice(once, 2)).toBe(once);
    }
  });

  /** 输到一半的价格留给用户去填完，而不是被改写成一个为零的价格。 */
  it('leaves a box that holds no price alone', () => {
    expect(normalizeLimitPrice('', 2)).toBe('');
    expect(normalizeLimitPrice('.', 2)).toBe('');
    expect(normalizeLimitPrice('-', 2)).toBe('');
    expect(normalizeLimitPrice('abc', 2)).toBe('');
    expect(normalizeLimitPrice('0', 2)).toBe('');
  });

  it('leaves a price untouched when no market says how it ticks', () => {
    expect(normalizeLimitPrice('63393.5555')).toBe('63393.5555');
  });
});

describe('composeOrder', () => {
  it('allows a rounded 100% notional when its submitted size stays in the cap', () => {
    const price = 1877.99;
    const f = facts({
      coin: 'ETH',
      market: priced('ETH', price, 4),
      activeAssetData: capacity('ETH', price, '4.8', '0.0255'),
    });

    expect(reason(f, input({ leverage: 10, amount: '47.89' }))).toBeNull();
    expect(reason(f, input({ leverage: 10, amount: '48.08' }))).toBe(
      'insufficient-margin'
    );
  });

  /**
   * 一手价值不到半分钱的市场 —— Hyperliquid 上有 36 个这样交易的市场 —— 过去会输给分位
   * 舍入：基数本身已经是可下单的最大名义价值，所以把它的最后一分向上舍入，就多买了一手，
   * 超出账户能覆盖的范围，于是 100% 按钮把自己的提交按钮给禁用了。
   */
  it('keeps 100% inside the cap on a market whose lot is worth under a cent', () => {
    const price = 0.002718;
    const f = facts({
      coin: 'kPEPE',
      market: priced('kPEPE', price, 0),
      activeAssetData: capacity('kPEPE', price, '3.7708', '1000000'),
    });
    const at100 = input({ leverage: 10, activePercent: 100 });

    const amount = amountForPercent(composeOrder(f, at100), 100);

    // 最大值会在按手量化之前，先扣掉那笔已确认的 0.5% 预留。
    expect(Number(amount)).toBeLessThanOrEqual(37.706814);
    expect(reason(f, { ...at100, amount })).toBeNull();
    expect(composeOrder(f, { ...at100, amount }).submittable).toBeTrue();
  });

  it('never sizes a percentage above the notional the lot can express', () => {
    const price = 0.002718;
    const f = facts({
      coin: 'kPEPE',
      market: priced('kPEPE', price, 0),
      activeAssetData: capacity('kPEPE', price, '3.7708', '1000000'),
    });

    [10, 25, 50, 75, 100].forEach((percent) => {
      const at = input({ leverage: 10, activePercent: percent });
      const amount = amountForPercent(composeOrder(f, at), percent);

      expect(reason(f, { ...at, amount }))
        .withContext(`${percent}% of buying power`)
        .not.toBe('insufficient-margin');
    });
  });

  /**
   * Hyperliquid 的 $10 下限是对着它收到的那笔订单量的，也就是按手向下取整后再乘回价格的
   * 结果 —— 在一个价格 $3.33 的整币市场上，$10 就是三个币，也就是 $9.99。
   */
  it('rejects an amount whose lot-floored notional falls under the $10 floor', () => {
    const f = facts({
      coin: 'SOME',
      market: priced('SOME', 3.33, 0),
      // 容量足够，好让先被问到的保证金检查能够通过。
      activeAssetData: capacity('SOME', 3.33, '100', '1000'),
    });

    expect(reason(f, input({ amount: '10' }))).toBe('below-minimum');
    expect(composeOrder(f, input({ amount: '10' })).submittable).toBeFalse();
    expect(reason(f, input({ amount: '13.32' }))).toBeNull();
  });

  it('exempts a full close from the minimum order notional', () => {
    const position = ethPosition({
      key: 'hl:SOME',
      coin: 'SOME',
      symbol: 'SOME',
      sziExact: '1',
      entryPxExact: '3.33',
      positionValueExact: '3.33',
      liquidationPxExact: null,
      leverage: 5,
      leverageType: 'isolated',
      marginUsedExact: '0.67',
      isLong: true,
    });
    const f = facts({
      coin: 'SOME',
      market: priced('SOME', 3.33, 0),
      account: {
        availability: 'live',
        account: account({ positions: [position] }),
        missingDexes: [],
        updatedAt: 1,
      },
    });
    const closing = input({ mode: 'close', side: 'short', activePercent: 100 });
    const amount = amountForPercent(composeOrder(f, closing), 100);
    const composed = composeOrder(f, { ...closing, amount });

    expect(composed.fullClose).toBeTrue();
    expect(composed.operation).toBe('close');
    expect(composed.availability).toBeNull();
  });

  it('prices margin and fee off the size that reaches the exchange', () => {
    const f = facts({ coin: 'SOME', market: priced('SOME', 3.33, 0) });

    const { preview } = composeOrder(f, input({ leverage: 2, amount: '39.9' }));

    // 11 手乘 3.33 是 36.63，而不是输入的 39.90。
    expect(preview.sizeExact).toBe('11');
    expect(preview.marginExact).toBe('18.315');
    expect(preview.feeExact).toBe('0.0164835');
  });

  it('has nothing to preview before an amount is typed', () => {
    const f = facts({ market: priced('ETH', 2000, 4) });

    const composed = composeOrder(f, input({ leverage: 10 }));

    expect(composed.preview).toBeNull();
    expect(composed.availability).toBeNull();
    expect(composed.submittable).toBeFalse();
  });

  it('quotes both fee sides only for a limit order', () => {
    const f = facts({ market: priced('ETH', 2000, 4) });

    expect(composeOrder(f, input()).quotesBothFeeSides).toBeFalse();
    expect(
      composeOrder(f, input({ orderType: 'limit' })).quotesBothFeeSides
    ).toBeTrue();
  });

  // 返佣是付给账户的钱，所以正负号必须一路带到最外面。
  it('reports a negative maker total as a rebate', () => {
    const f = facts({
      market: priced('ETH', 2000, 4),
      feeRates: { takerRate: 0.00045, makerRate: -0.00002, builderRate: 0 },
    });

    expect(composeOrder(f, input()).makerFeeIsRebate).toBeTrue();
  });

  it('blocks increasing a cross-margin position', () => {
    const f = facts({
      market: priced('ETH', 100, 2),
      account: {
        availability: 'live',
        account: account({
          positions: [
            ethPosition({
              sziExact: '1',
              entryPxExact: '100',
              positionValueExact: '100',
              liquidationPxExact: null,
              leverageType: 'cross',
              marginUsedExact: '20',
              isLong: true,
            }),
          ],
        }),
        missingDexes: [],
        updatedAt: 1,
      },
    });

    expect(reason(f, input({ amount: '100' }))).toBe('cross-position');
  });

  /**
   * 交易场所没有「翻转」这种订单：反手是在一张单子上下 |仓位| + 数量。把一笔普通的反方向
   * 订单读成反手，会签下数倍于表单所预览的风险，所以页面改为直接问用户本意是什么。
   */
  it('refuses to read an opposite-side order as a reverse', () => {
    const f = facts({
      market: priced('ETH', 100, 2),
      account: {
        availability: 'live',
        account: account({
          positions: [
            ethPosition({
              sziExact: '-0.75',
              entryPxExact: '100',
              positionValueExact: '75',
              liquidationPxExact: null,
              leverageType: 'isolated',
              marginUsedExact: '15',
              isLong: false,
            }),
          ],
        }),
        missingDexes: [],
        updatedAt: 1,
      },
    });

    const composed = composeOrder(f, input({ side: 'long', amount: '20' }));

    expect(composed.availability.code).toBe('holding-short');
    expect(composed.submittable).toBeFalse();
    expect(composed.intent).toBeNull();
  });

  it('adds to a position held on the same side', () => {
    const f = facts({
      market: priced('ETH', 100, 2),
      activeAssetData: capacity('ETH', 100, '1000', '100', 1),
      account: {
        availability: 'live',
        account: account({
          positions: [
            ethPosition({
              sziExact: '0.75',
              entryPxExact: '100',
              positionValueExact: '75',
              liquidationPxExact: '60',
              leverageType: 'isolated',
              marginUsedExact: '15',
              isLong: true,
            }),
          ],
        }),
        missingDexes: [],
        updatedAt: 1,
      },
    });

    const composed = composeOrder(f, input({ side: 'long', amount: '20' }));

    expect(composed.increasesPosition).toBeTrue();
    expect(composed.operation).toBe('increase');
    expect(composed.availability).toBeNull();
    // 交易场所自己给出的数字会显示在估算值旁边。
    expect(composed.showsCurrentLiquidationPrice).toBeTrue();
  });

  /**
   * 组合保证金账户的账户级数字不可用，所以增加风险的订单既不能换算数量也不能预览。平仓
   * 改为读取仓位本身，而「用户在这里退不出仓位」是唯一值得竭力避免的结局（ADR-0007）。
   */
  it('bars a portfolio-margin account from opening but not from closing', () => {
    const position = ethPosition({ isLong: true, sziExact: '0.75' });
    const f = facts({
      market: priced('ETH', 100, 2),
      account: {
        availability: 'live',
        account: account({
          abstractionMode: 'portfolioMargin',
          positions: [position],
        }),
        missingDexes: [],
        updatedAt: 1,
      },
    });

    expect(reason(f, input({ amount: '20' }))).toBe('portfolio-margin');
    expect(
      reason(f, input({ mode: 'close', side: 'short', amount: '18.89' }))
    ).not.toBe('portfolio-margin');
  });

  /**
   * HIP-3 市场上部署方分成的那一份在任何地方都没有上报，所以手续费那一行必须如实说明，
   * 而不是照报标准永续的费率 —— 但它不能拦下订单，因为手续费并不改变订单本身。
   */
  it('declines to quote a fee on a HIP-3 market without blocking the order', () => {
    const canonical = facts({ market: priced('ETH', 100, 2) });
    const hip3 = facts({
      coin: 'xyz:ETH',
      market: {
        status: 'ready',
        market: ethMarket({
          key: 'xyz:ETH',
          dex: 'xyz',
          coin: 'xyz:ETH',
          symbol: 'ETH',
        }),
      },
      activeAssetData: capacity('xyz:ETH', 100, '100', '10'),
    });

    expect(composeOrder(canonical, input()).feeEstimateUnavailable).toBeFalse();
    expect(composeOrder(hip3, input()).feeEstimateUnavailable).toBeTrue();
    expect(reason(hip3, input({ amount: '20' }))).toBeNull();
  });

  it('reports an unreadable account before anything the form could fix', () => {
    const f = facts({
      market: priced('ETH', 100, 2),
      account: {
        availability: 'unavailable',
        account: null,
        missingDexes: [],
        updatedAt: null,
      },
    });

    expect(reason(f, input({ amount: '20' }))).toBe('account-unavailable');
  });

  it('refuses a market order on a market with no mid to price against', () => {
    const f = facts({
      market: {
        status: 'ready',
        market: ethMarket({ midPxExact: null, markPxExact: '100' }),
      },
      activeAssetData: capacity('ETH', 100, '100', '10'),
    });

    expect(reason(f, input({ amount: '20' }))).toBe('no-execution-price');
    // 限价单自己定价，所以缺失的中间价不是它的问题。
    expect(
      reason(f, input({ orderType: 'limit', limitPrice: '100', amount: '20' }))
    ).toBeNull();
  });

  it('refuses a slippage an older build may have written to storage', () => {
    const f = facts({ market: priced('ETH', 100, 2) });

    expect(reason(f, input({ amount: '20', slippagePercent: 25 }))).toBe(
      'slippage-out-of-range'
    );
  });

  it('carries the reviewed order into an intent the trade module accepts', () => {
    const f = facts({
      market: priced('ETH', 100, 2, 20),
      activeAssetData: capacity('ETH', 100, '100', '10', 5),
    });

    const { intent } = composeOrder(
      f,
      input({ leverage: 5, amount: '100', slippagePercent: 1.5 })
    );

    expect(intent).toEqual({
      market: {
        key: 'hl:ETH',
        coin: 'ETH',
        dex: '',
        assetId: 0,
        szDecimals: 2,
        maxLeverage: 20,
      },
      operation: 'open',
      side: 'long',
      referencePriceExact: '100',
      requestedSizeExact: '1',
      leverage: 5,
      orderType: 'market',
      maxSlippagePercent: 1.5,
    });
  });
});

/** 审核基准存在的意义，就是回答这两个问题。 */
describe('review baseline', () => {
  const baseline: PerpsReviewBaseline = {
    priceExact: '100',
    amount: '20',
    limitPrice: '',
    side: 'long',
    orderType: 'market',
    leverage: 5,
    slippagePercent: 3,
    mode: 'open',
  };
  const formInput: PerpsOrderInput = {
    mode: 'open',
    side: 'long',
    orderType: 'market',
    amount: '20',
    limitPrice: '',
    leverage: 5,
    slippagePercent: 3,
    activePercent: null,
  };
  const marketAt = (price: string | null): PerpsOrderFacts => ({
    coin: 'ETH',
    market: { status: 'ready', market: ethMarket({ midPxExact: price }) },
    account: {
      availability: 'live',
      account: null,
      missingDexes: [],
      updatedAt: 1,
    },
    activeAssetData: null,
    feeRates: { takerRate: 0.00045, makerRate: 0.00015, builderRate: 0 },
  });

  it('holds while the form still reads as it did at review', () => {
    expect(intentUnchanged(baseline, formInput)).toBeTrue();
    expect(intentUnchanged(baseline, { ...formInput, amount: '21' })).toBeFalse();
    expect(intentUnchanged(baseline, { ...formInput, side: 'short' })).toBeFalse();
    // 落在同一个金额上的百分比按钮，什么都没有改变。
    expect(
      intentUnchanged(baseline, { ...formInput, activePercent: 50 })
    ).toBeTrue();
  });

  it('holds while the market stays inside the agreed window', () => {
    expect(withinReviewedSlippage(baseline, marketAt('102'), formInput)).toBeTrue();
    expect(withinReviewedSlippage(baseline, marketAt('104'), formInput)).toBeFalse();
  });

  /** 限价单自己定价，所以它不可能漂出自己的窗口。 */
  it('is inert for a limit order', () => {
    const limit = {
      ...formInput,
      orderType: 'limit' as const,
      limitPrice: '100',
    };

    expect(withinReviewedSlippage(baseline, marketAt('400'), limit)).toBeTrue();
  });

  it('allows a move that lands exactly on the tolerance', () => {
    // 最大滑点是用户同意的**全部**，所以正好落在上面仍然算同意过。
    expect(withinReviewedSlippage(baseline, marketAt('103'), formInput)).toBeTrue();
    expect(withinReviewedSlippage(baseline, marketAt('97'), formInput)).toBeTrue();
  });

  it('refuses a move past the tolerance, in either direction', () => {
    expect(
      withinReviewedSlippage(baseline, marketAt('103.01'), formInput)
    ).toBeFalse();
    expect(
      withinReviewedSlippage(baseline, marketAt('96.99'), formInput)
    ).toBeFalse();
  });

  /** 在六位小数下，市场的波动幅度可能小于浮点比较能分辨的程度。 */
  it('measures the move on the decimals, not on a float of them', () => {
    const tiny: PerpsReviewBaseline = {
      ...baseline,
      priceExact: '0.000001',
      slippagePercent: 5,
    };
    const tinyInput = { ...formInput, slippagePercent: 5 };

    expect(
      withinReviewedSlippage(tiny, marketAt('0.00000106'), tinyInput)
    ).toBeFalse();
    expect(
      withinReviewedSlippage(tiny, marketAt('0.00000104'), tinyInput)
    ).toBeTrue();
  });

  /** 没有约定的价格可供度量，就不能据此签任何名。 */
  it('refuses when either side has no price at all', () => {
    expect(
      withinReviewedSlippage({ ...baseline, priceExact: '0' }, marketAt('100'), formInput)
    ).toBeFalse();
    expect(withinReviewedSlippage(baseline, marketAt(null), formInput)).toBeFalse();
    expect(
      withinReviewedSlippage(baseline, marketAt('100'), {
        ...formInput,
        slippagePercent: NaN,
      })
    ).toBeFalse();
  });

  it('refuses when there is no baseline at all', () => {
    expect(intentUnchanged(null, formInput)).toBeFalse();
    expect(withinReviewedSlippage(null, marketAt('100'), formInput)).toBeFalse();
  });
});
