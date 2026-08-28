import { PerpsAccount, PerpsActiveAssetData } from '@popup/_lib/perps';
import {
  amountForPercent,
  availableToTradeForSide,
  composeOrder,
  intentUnchanged,
  withinReviewedSlippage,
  PerpsOrderFacts,
  PerpsOrderInput,
  PerpsOrderMarketFacts,
  PerpsReviewBaseline,
  collateralToNotional,
  exceedsMaxSlippage,
  maxOrderNotionalForSide,
  normalizeLimitPrice,
  notionalAtLotSize,
  previewClosePosition,
  previewOrder,
  sizeAtLot,
} from './perps-order-composition';
import { ethMarket, ethPosition } from '../perps.test-fixture';

/**
 * 直接检验下单表单所依赖的那些算术。
 *
 * 它们对组合模块而言是内部的 —— 页面只会调用 `composeOrder` —— 但协议的舍入规则就住在
 * 这里，而把一个边界情况写在这里，远比从一次完整组合里绕过去便宜得多。
 */
describe('perps order arithmetic', () => {
  it('selects Hyperliquid long and short availability independently', () => {
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 2 },
      maxTradeSzs: ['0.5323', '0.5223'] as [string, string],
      availableToTrade: ['1008.75', '989.78'] as [string, string],
      markPx: 1895,
    };

    expect(availableToTradeForSide(data, 'long')).toBe('1008.75');
    expect(availableToTradeForSide(data, 'short')).toBe('989.78');
    // 这里按单资产的数量上限先卡住，远早于抵押品卡住它。
    expect(maxOrderNotionalForSide(data, 'long', 2).toNumber()).toBeCloseTo(
      0.5323 * 1895,
      8
    );
  });

  it('reads availableToTrade as collateral, not as a leverage-scaled notional', () => {
    // 已对照 API 验证：在没有仓位的账户上，杠杆处于 20 倍时 availableToTrade 与
    // withdrawable 完全相等。预览另一个杠杆不能让它变动。
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 20 },
      maxTradeSzs: ['1000000000', '1000000000'] as [string, string],
      availableToTrade: ['4.8', '4.8'] as [string, string],
      markPx: 1925,
    };

    expect(availableToTradeForSide(data, 'long')).toBe('4.8');
    expect(availableToTradeForSide(data, 'short')).toBe('4.8');
  });

  it('turns collateral into buying power with leverage', () => {
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 20 },
      maxTradeSzs: ['1000000000', '1000000000'] as [string, string],
      availableToTrade: ['4.8', '4.8'] as [string, string],
      markPx: 1925,
    };

    // 4.8 USDC 在 3 倍杠杆下能买 14.4 的名义价值，所以一笔 10 USDC 的订单放得下 ——
    // 旧的按杠杆缩放会把它当成保证金不足而拒绝。
    const max = maxOrderNotionalForSide(data, 'long', 3);
    expect(max.toNumber()).toBeCloseTo(14.4, 8);
    expect(max.isGreaterThan(10)).toBeTrue();

    expect(collateralToNotional(4.8, 10)).toBeCloseTo(48, 8);
    // 低于 1 倍的杠杆，买不到比抵押品本身更多的东西。
    expect(collateralToNotional(4.8, 0.5)).toBeCloseTo(4.8, 8);
  });

  it('trims the 100% notional to the market lot, as Hyperliquid does', () => {
    // 与 Hyperliquid 自己的表单交叉核对过：4.80 USDC、10 倍杠杆、ETH 在 1925.57 时显示的
    // 是 47.95 而不是原始的 48.00 —— floor(48/1925.57) 取四位小数是 0.0249，
    // 再乘回价格得到 47.9467。
    expect(notionalAtLotSize(48, 1925.57, 4)).toBeCloseTo(0.0249 * 1925.57, 8);
    expect(Number(notionalAtLotSize(48, 1925.57, 4).toFixed(2))).toBe(47.95);

    // 只能整数计量的市场，表达不了合约的任何小数部分。
    expect(notionalAtLotSize(48, 1925.57, 0)).toBeCloseTo(0, 8);
    // 没有可用的价格，就没有可供量化的基准。
    expect(notionalAtLotSize(48, 0, 4)).toBe(48);
  });

  it('preserves an exchange size cap that is already on an exact lot', () => {
    const price = 1877.75;
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'isolated' as const, value: 10 },
      maxTradeSzs: ['0.0255', '0.0255'] as [string, string],
      availableToTrade: ['4.8', '4.8'] as [string, string],
      markPx: price,
    };
    const cappedNotional = maxOrderNotionalForSide(
      data,
      'long',
      10,
      price
    );

    expect(notionalAtLotSize(cappedNotional, price, 4)).toBeCloseTo(
      0.0255 * price,
      10
    );
    expect(notionalAtLotSize(0.0254999 * price, price, 4)).toBeCloseTo(
      0.0254 * price,
      10
    );
  });

  it('keeps capacity decimals exact and floors the final size to the lot', () => {
    const data = {
      user: '0xabc',
      coin: 'APT',
      leverage: { type: 'cross' as const, value: 3 },
      maxTradeSzs: ['24836370.4400000013', '24836370.4400000013'] as [string, string],
      availableToTrade: ['37019438.0284740031', '37019438.0284740031'] as [string, string],
      markPx: 4.4716,
    };

    const cap = maxOrderNotionalForSide(data, 'long', 3, 4.4716);
    expect(cap.toFixed()).toBe('111058314.05950400581308');
    expect(sizeAtLot('0.025599999999999999', 4)).toBe('0.0255');
  });

  it('keeps the raw buying power while the execution price is unknown', () => {
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 3 },
      maxTradeSzs: ['0.5323', '0.5223'] as [string, string],
      availableToTrade: ['1008.75', '989.78'] as [string, string],
      markPx: 1895,
    };

    // 价格为零会让单资产上限也变成零，而那意味着「还没加载」而不是「没有容量」——
    // 把它钉成零会让百分比按钮全都归零。
    expect(maxOrderNotionalForSide(data, 'long', 3, 0).toFixed()).toBe(
      '3026.25'
    );
    expect(
      maxOrderNotionalForSide(data, 'long', 3, undefined).toNumber()
    ).toBeCloseTo(0.5323 * 1895, 8);
  });

  it('treats a zero max trade size as a binding side capacity', () => {
    const data = {
      user: '0xabc',
      coin: 'ETH',
      leverage: { type: 'cross' as const, value: 3 },
      maxTradeSzs: ['0', '0.5223'] as [string, string],
      availableToTrade: ['1008.75', '989.78'] as [string, string],
      markPx: 1895,
    };

    expect(maxOrderNotionalForSide(data, 'long', 3, 1895).toFixed()).toBe(
      '0'
    );
  });

  it('uses the exact position size when closing all despite rounded USD input', () => {
    const preview = previewClosePosition({
      position: ethPosition({ positionValueExact: '18.895' }),
      notionalExact: '18.89',
      szDecimals: 4,
      feeRate: 0.00045,
      fullClose: true,
    });

    expect(preview.sizeExact).toBe('0.01');
    expect(preview.releasedMarginExact).toBe('9.44');
    expect(preview.feeExact).toBe('0.00850275');
  });

  it('scales size and released margin for a partial close', () => {
    const preview = previewClosePosition({
      position: ethPosition({ positionValueExact: '18.88' }),
      notionalExact: '9.44',
      szDecimals: 4,
      feeRate: 0.00045,
      fullClose: false,
    });

    expect(preview.sizeExact).toBe('0.005');
    expect(preview.releasedMarginExact).toBe('4.72');
  });

  it('uses the limit execution price for size and liquidation preview', () => {
    const preview = previewOrder({
      market: ethMarket(),
      executionPriceExact: '80',
      notionalExact: '800',
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
    });

    expect(preview.sizeExact).toBe('10');
    expect(preview.marginExact).toBe('400');
    expect(Number(preview.liquidationPxExact)).toBeLessThan(80);
  });

  it('falls back to the mid, not the mark, without an execution price', () => {
    // 标记价格可能落在价差之外；市价单实际是按中间价定价的，
    // 所以数量换算也必须回退到中间价。
    const preview = previewOrder({
      market: ethMarket({ markPxExact: '100', midPxExact: '80' }),
      notionalExact: '800',
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
    });

    expect(preview.sizeExact).toBe('10');

    // 没有双边中间价的市场，不能拿标记价格来换算数量。
    expect(
      previewOrder({
        market: ethMarket({ markPxExact: '100', midPxExact: null }),
        notionalExact: '800',
        leverage: 2,
        isLong: true,
        feeRate: 0.00045,
      }).sizeExact
    ).toBe('0');
  });

  it('adds the builder fee to the exchange fee and reports both', () => {
    const preview = previewOrder({
      market: ethMarket(),
      notionalExact: '1000',
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
      builderFeeRate: 0.00045,
    });

    expect(preview.protocolFeeExact).toBe('0.45');
    expect(preview.builderFeeExact).toBe('0.45');
    expect(preview.feeExact).toBe('0.9');
  });

  it('charges no builder fee when none is configured', () => {
    const preview = previewOrder({
      market: ethMarket(),
      notionalExact: '1000',
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
    });

    expect(preview.builderFeeExact).toBe('0');
    expect(preview.feeExact).toBe(preview.protocolFeeExact);
  });

  it('charges the builder fee on a close as well', () => {
    const preview = previewClosePosition({
      position: ethPosition({ positionValueExact: '18.895' }),
      notionalExact: '18.89',
      szDecimals: 4,
      feeRate: 0.00045,
      builderFeeRate: 0.00045,
      fullClose: true,
    });

    expect(preview.protocolFeeExact).toBe('0.00850275');
    expect(preview.builderFeeExact).toBe('0.00850275');
    expect(preview.feeExact).toBe('0.0170055');
  });

  /**
   * 加仓不会新建出第二个仓位。交易场所是对合并后的仓位计算保证金的，所以一个只按这笔
   * 订单单独定价的估算 —— 背后只有它自己的保证金 —— 报出的是一个账户永远不会在那里被
   * 强平的价位。
   */
  describe('liquidation estimate when adding to a position', () => {
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

    const standalone = (executionPriceExact: string) =>
      previewOrder({
        market: ethMarket(),
        executionPriceExact,
        notionalExact: '1000',
        leverage: 2,
        isLong: true,
        feeRate: 0,
      }).liquidationPxExact;

    // 以自身的价格和杠杆把仓位翻倍，强平价不会有任何变化 —— 这是最能说明「合并是对整个
    // 仓位做算术，而不是只对这笔订单」的检验。
    it('leaves the level unmoved when the order matches what is held', () => {
      const preview = previewOrder({
        market: ethMarket(),
        executionPriceExact: '100',
        notionalExact: '1000',
        leverage: 2,
        isLong: true,
        feeRate: 0,
        position: heldLong(),
      });

      expect(Number(preview.liquidationPxExact)).toBeCloseTo(
        Number(standalone('100')),
        10
      );
      expect(Number(preview.liquidationPxExact)).toBeCloseTo(51.0204, 4);
    });

    // 在更高价位买入会把按数量加权的入场价拉高，所以合并后的价位高于仓位自身的，
    // 又低于这笔订单单独面对的。
    it('weights the entry by size when the order fills higher', () => {
      const merged = Number(
        previewOrder({
          market: ethMarket(),
          executionPriceExact: '120',
          notionalExact: '1000',
          leverage: 2,
          isLong: true,
          feeRate: 0,
          position: heldLong(),
        }).liquidationPxExact
      );

      expect(merged).toBeGreaterThan(Number(standalone('100')));
      expect(merged).toBeLessThan(Number(standalone('120')));
    });

    // 保证金数字仍然是这笔订单自己的：它是这笔订单锁定的金额，
    // 而不是合并后仓位持有的金额。
    it('still reports the margin this order locks', () => {
      const preview = previewOrder({
        market: ethMarket(),
        executionPriceExact: '100',
        notionalExact: '1000',
        leverage: 2,
        isLong: true,
        feeRate: 0,
        position: heldLong(),
      });

      expect(preview.marginExact).toBe('500');
    });

    // 反方向的订单要么是减仓要么是反手，而下单表单拒绝去猜是哪一种 ——
    // 所以没有东西可供合并。
    it('ignores a position held on the other side', () => {
      const preview = previewOrder({
        market: ethMarket(),
        executionPriceExact: '100',
        notionalExact: '1000',
        leverage: 2,
        isLong: true,
        feeRate: 0,
        position: ethPosition({
          sziExact: '-10',
          entryPxExact: '100',
          marginUsedExact: '500',
          leverageType: 'isolated',
          isLong: false,
        }),
      });

      expect(Number(preview.liquidationPxExact)).toBeCloseTo(
        Number(standalone('100')),
        10
      );
    });

    // 不足一手就没有订单可以合并，而除以为零的数量
    // 得到的会是一个无穷大而不是一个价格。
    it('falls back to the ratio when the order cannot reach one lot', () => {
      const preview = previewOrder({
        market: ethMarket({ szDecimals: 0 }),
        executionPriceExact: '100',
        notionalExact: '50',
        leverage: 2,
        isLong: true,
        feeRate: 0,
        position: heldLong(),
      });

      expect(preview.sizeExact).toBe('0');
      expect(Number(preview.liquidationPxExact)).toBeCloseTo(51.0204, 4);
    });
  });

  /**
   * 最大滑点就是用户对价格的全部同意，所以它同时也决定了用户审核过的那个价格在提交时
   * 是否依然成立。
   */
  describe('exceedsMaxSlippage', () => {
    it('allows a move inside the tolerance, in either direction', () => {
      expect(exceedsMaxSlippage('100', '100.5', 1)).toBeFalse();
      expect(exceedsMaxSlippage('100', '99.5', 1)).toBeFalse();
    });

    // 边界就是约定的上限本身，而不是再多一个最小变动价位。
    it('allows a move that lands exactly on the tolerance', () => {
      expect(exceedsMaxSlippage('100', '101', 1)).toBeFalse();
      expect(exceedsMaxSlippage('100', '99', 1)).toBeFalse();
    });

    it('refuses a move past the tolerance', () => {
      expect(exceedsMaxSlippage('100', '101.01', 1)).toBeTrue();
      expect(exceedsMaxSlippage('100', '98.99', 1)).toBeTrue();
    });

    // 六位小数的市场，其波动幅度会被浮点比较抹掉。
    it('measures the move on the decimals, not on a float of them', () => {
      expect(exceedsMaxSlippage('0.000001', '0.00000106', 5)).toBeTrue();
      expect(exceedsMaxSlippage('0.000001', '0.00000104', 5)).toBeFalse();
    });

    // 「没有价格」不等于「价格没变」。
    it('refuses when either side has no price at all', () => {
      expect(exceedsMaxSlippage(null, '100', 1)).toBeTrue();
      expect(exceedsMaxSlippage('100', null, 1)).toBeTrue();
      expect(exceedsMaxSlippage('0', '100', 1)).toBeTrue();
      expect(exceedsMaxSlippage('100', '0', 1)).toBeTrue();
      expect(exceedsMaxSlippage('100', '100', NaN)).toBeTrue();
    });
  });

  /**
   * 签名的价格必须就是屏幕上的价格，所以输入框也要经过上链价格所依据的同一条规则做规范化。
   */
  describe('normalizeLimitPrice', () => {
    it('quantises to the tighter of the tick and five significant figures', () => {
      // BTC（szDecimals 为 5）报一位小数，但在这个量级上先卡住的是五位有效数字。
      expect(normalizeLimitPrice('63393.55', 5)).toBe('63394');
      // SOL（szDecimals 为 2）报四位小数；有效数字只允许三位。
      expect(normalizeLimitPrice('75.7565', 2)).toBe('75.757');
      // PUMP（szDecimals 为 0）报六位，此时卡住的是最小变动价位。
      expect(normalizeLimitPrice('0.0029794', 0)).toBe('0.002979');
    });

    // 跑两遍不能让价格继续移动，否则输入框每次失焦都会漂一点。
    it('is a no-op on a price it has already quantised', () => {
      ['63393.55', '75.7565', '0.0029794', '1886'].forEach((price) => {
        const once = normalizeLimitPrice(price, 2);
        expect(normalizeLimitPrice(once, 2)).toBe(once);
      });
    });

    // 正在编辑中的输入框属于用户；只有输入完成的价格才会被改写。
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
  });});

/**
 * 把整张表单作为一个整体来读：它会提交什么，以及它不能提交的那唯一一条理由。这里的每个
 * 用例过去都要靠在一个半构造的页面组件上赋字段、再读它的 getter 来表达。
 */
describe('composeOrder', () => {
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
  const marketAt = (price: string): PerpsOrderFacts => ({
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

  it('refuses when there is no baseline at all', () => {
    expect(intentUnchanged(null, formInput)).toBeFalse();
    expect(withinReviewedSlippage(null, marketAt('100'), formInput)).toBeFalse();
  });
});
