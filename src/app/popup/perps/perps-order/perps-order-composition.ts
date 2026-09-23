import BigNumber from 'bignumber.js';
import { protectionPrice, validProtection } from '@popup/_lib/perps-protection';

import {
  PerpsAccount,
  PerpsCrossMarginAccount,
  PerpsAccountState,
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsMarginMode,
  PerpsOrderPreview,
  PerpsOrderSide,
  PerpsOrderType,
  PerpsPosition,
  PerpsTradeIntent,
  PerpsTradeOrderIntent,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PERPS_MIN_ORDER_NOTIONAL,
  PERPS_MIN_SLIPPAGE_PERCENT,
  perpsPriceDecimals,
  perpsSizeAtLot,
} from '@popup/_lib/perps';
import { PerpsExactValue } from '../perps.util';
import { crossLiquidationPrice, isolatedLiquidationPrice } from '@popup/_lib/perps-margin';

/** 美元金额按分输入、也按分提交。 */
const AMOUNT_DECIMALS = 2;

/**
 * 这张表单针对的市场，以及数据源是否已经就它作出答复。
 *
 * 「本版本不承载这个币种」与「它的数据还没到」是两个不同的答案，表单必须说清是哪一个 ——
 * 所以这个区分是一个事实，而不是从「市场缺失」里推断出来的东西。
 */
export type PerpsOrderMarketFacts =
  | { status: 'loading' }
  | { status: 'ready'; market: PerpsMarket }
  | { status: 'missing' }
  | { status: 'error' };

/** Hyperliquid 给这个账户的费率，外加 NeoLine 的 builder 抽成。 */
export interface PerpsOrderFeeRates {
  takerRate: string;
  makerRate: string;
  /** 除非当前网络配置了 builder 地址，否则为零。 */
  builderRate: string;
}

/**
 * 交易场所当前所说的一切，以本页面读到的样子呈现。
 *
 * 读取失败同样是事实：`account` 原样来自账户状态流，可用性信息一并带上，因此一个读不到
 * 的账户绝不会被误当成一个什么都没有的账户（见根 CONTEXT 中的账户状态）。
 */
export interface PerpsOrderFacts {
  /** 路由中的币种，HIP-3 市场会带上 DEX 前缀。 */
  coin: string;
  market: PerpsOrderMarketFacts;
  account: PerpsAccountState<PerpsAccount>;
  /** 全仓预估使用的完整抵押池；未收到快照或数据不足时不编造强平价。 */
  crossMarginAccount?: PerpsCrossMarginAccount | null;
  /** 单资产容量；在 `activeAssetData` 到达之前为 null。 */
  activeAssetData: PerpsActiveAssetData | null;
  feeRates: PerpsOrderFeeRates;
}

/**
 * 用户输入了什么、按了什么。不含任何派生值，也不回读任何东西。
 *
 * `amount` 和 `limitPrice` 是输入框的原文，包括输到一半的文本：ADR-0001 要求签名的数值
 * 不经过 JavaScript 浮点，而一个正从 "1." 走向 "1.25" 的输入框，不能在光标底下被改写。
 * 还不是正数小数的文本，直接读作「没有金额」。
 */
export interface PerpsOrderInput {
  protectionEnabled?: boolean;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  /** close 是减少已有仓位；open 涵盖开仓和同向加仓。 */
  mode: 'open' | 'close';
  side: PerpsOrderSide;
  orderType: PerpsOrderType;
  amount: string;
  limitPrice: string;
  leverage: number;
  marginMode: PerpsMarginMode;
  slippagePercent: number;
  /** 由百分比按钮决定数量时置位，一旦手动输入就变回 null。 */
  activePercent: number | null;
}

/**
 * 这笔订单为什么不能提交 —— 以「条件」而非「文案」的形式给出。
 *
 * 措辞归页面所有：错误码挺得过文案改写，而一个断言 `'insufficient-margin'` 的模块 spec
 * 陈述的是规则，而不是钉住一个翻译 key。
 */
export type PerpsOrderUnavailableCode =
  | 'invalid-protection'
  | 'account-unavailable'
  | 'market-missing'
  | 'market-error'
  | 'cross-margin-unavailable'
  | 'margin-mode-mismatch'
  | 'holding-long'
  | 'holding-short'
  | 'no-position-to-close'
  | 'no-execution-price'
  | 'slippage-out-of-range'
  | 'insufficient-margin'
  | 'below-minimum';

export interface PerpsOrderUnavailable {
  code: PerpsOrderUnavailableCode;
  /** 该原因需要插值时所用的值。 */
  params: { min: number; symbol: string };
}

/** 用户确认过的内容，由页面保存到他们按下提交的那一刻。 */
export interface PerpsReviewBaseline {
  protectionEnabled?: boolean;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  /** 用户审核时屏幕上的成交参考价。 */
  priceExact: string;
  amount: string;
  limitPrice: string;
  side: PerpsOrderSide;
  orderType: PerpsOrderType;
  leverage: number;
  marginMode: PerpsMarginMode;
  slippagePercent: number;
  mode: 'open' | 'close';
}

/** 对表单的一次读数：它会提交什么，以及它是否被允许提交。 */
export interface PerpsOrderComposition {
  /** 在有金额可供预览之前为空。 */
  preview: PerpsOrderPreview | null;
  /** 阻止提交的那唯一一条原因；没有时为 null。 */
  availability: PerpsOrderUnavailable | null;
  /**
   * 要交给交易订单模块的意图；当事实与输入还不足以描述一笔可提交的订单时为 null。
   */
  intent: PerpsTradeOrderIntent | null;
  /**
   * 事实与输入是否允许提交。页面会在此之上叠加它自己的临时闸门 —— 「有一次提交正在进行」
   * 不是订单的属性。
   */
  submittable: boolean;
  market: PerpsMarket | null;
  position: PerpsPosition | null;
  symbol: string;
  isLong: boolean;
  closeMode: boolean;
  operation: PerpsTradeIntent;
  fullClose: boolean;
  increasesPosition: boolean;
  /** 该方向上的自由抵押品，取交易场所上报的值。 */
  availableExact: string | null;
  positionSizeExact: string;
  orderPriceExact: string;
  orderSizeExact: string;
  /** 百分比按钮所度量的名义价值基数。开仓时 100% 落在这里。 */
  percentBaseExact: string;
  amountSliderPercent: number;
  leverageSliderPercent: number;
  /**
   * 这个市场上实际收取的费率，页面报出的每一个费率和手续费都取自这里。
   * `feeEstimateUnavailable` 时它只是账户费率，页面不拿它报价。
   */
  feeRates: PerpsOrderFeeRates;
  feeEstimateUnavailable: boolean;
  quotesBothFeeSides: boolean;
  makerFeeIsRebate: boolean;
}

/**
 * 一次性读出整张表单：预览、可用性，以及它会提交的那笔订单。
 *
 * 这是从当前事实和当前输入出发的纯映射，两次调用之间不保留任何东西。这是要点而不是实现
 * 细节 —— 按 ADR-0005 和 ADR-0006，页面保存的是审核基准，而不是账户、盘口和费率的一份
 * 冻结组合，因此这里的每一个读数都由「此刻为真的东西」推导而来。
 */
export function composeOrder(
  facts: PerpsOrderFacts,
  input: PerpsOrderInput,
  /** 解锁及发送期间校验、展示同一个待提交数量。 */
  pendingSizeExact?: string
): PerpsOrderComposition {
  const market = facts.market.status === 'ready' ? facts.market.market : null;
  const account = facts.account.account;
  // 容量属于交易场所当前模式；切换后的预览不能沿用另一种模式的按方向抵押品与上限。
  const activeAssetData = facts.activeAssetData?.leverage.type === input.marginMode
    ? facts.activeAssetData : null;
  const accountUnavailable = facts.account.availability === 'unavailable' ||
    (input.mode !== 'close' && !activeAssetData &&
      account?.abstractionMode === 'unknown');
  const marketRates = marketFeeRates(facts.feeRates, market);
  // 估不出这个市场的费率时，内部算术退回账户费率；页面凭 `feeEstimateUnavailable` 不拿它报价。
  const feeRates = marketRates ?? facts.feeRates;
  const { takerRate, makerRate, builderRate } = feeRates;

  const closeMode = input.mode === 'close';
  const isLong = input.side === 'long';
  const symbol = market?.symbol ?? facts.coin;
  const szDecimals = market?.szDecimals;

  // 这张表单所作用的仓位。在这里推导而不是从外面传进来：它是账户针对这个市场给出的答案，
  // 不是一个页面可以另有主张的独立事实。
  const position =
    account?.positions.find((item) => item.coin === facts.coin) ?? null;

  const orderPriceExact = executionPriceExact(market, input);
  const orderPrice = new BigNumber(orderPriceExact);
  const hasExecutionPrice = orderPrice.isFinite() && orderPrice.isGreaterThan(0);

  const amountExact = typedAmount(input.amount);
  const hasAmount = amountExact.isGreaterThan(0);

  const positionSizeExact = new BigNumber(position?.sziExact ?? 0)
    .absoluteValue()
    .toFixed();

  // 表单显示的是两位小数的美元，所以那个舍入后的最大值仍然必须代表 100%；
  // 若要求它等于精度更高的 API 值，就会留下零头。
  const fullClose =
    closeMode &&
    !!position &&
    (input.activePercent === 100 ||
      amountExact.isGreaterThanOrEqualTo(
        new BigNumber(position.positionValueExact).toFixed(AMOUNT_DECIMALS)
      ));

  const orderSizeExact = pendingSizeExact ?? submittedSize({
    market,
    position,
    closeMode,
    fullClose,
    hasAmount,
    hasExecutionPrice,
    amountExact,
    orderPriceExact,
  });

  // 订单的数量按市场最小变动单位向下取整之后，它实际值多少。输入的金额最多会高估一个
  // 最小变动单位，而这个差值在两端都起约束作用：Hyperliquid 就是按这个口径拒绝低于 $10
  // 的订单，而保证金和手续费那两行也应当报出真正被下的那笔订单。
  const executableNotional = new BigNumber(orderSizeExact).times(
    orderPriceExact
  );

  const operation: PerpsTradeIntent = closeMode
    ? fullClose
      ? 'close'
      : 'reduce'
    : position && position.isLong === isLong
    ? 'increase'
    : 'open';

  const increasesPosition =
    !closeMode && !!position && position.isLong === isLong;

  const availableExact = activeAssetData
    ? availableToTradeForSide(activeAssetData, input.side)
    : account?.availableBalanceExact ?? null;

  const maxOrderNotional = activeAssetData
    ? maxOrderNotionalForSide(
        activeAssetData,
        input.side,
        input.leverage,
        orderPriceExact
      )
    : collateralToNotional(availableExact ?? '0', input.leverage);

  const percentBase = percentBaseFor({
    closeMode,
    market,
    position,
    maxOrderNotional,
    orderPriceExact,
  });

  const preview = composePreview({
    crossMarginAccount: facts.crossMarginAccount,
    market,
    position,
    closeMode,
    hasAmount,
    leverage: input.leverage,
    marginMode: input.marginMode,
    isLong,
    orderPriceExact,
    orderSizeExact,
    executableNotional,
    takerRate,
    builderRate,
    quoteReceive: marketRates !== null,
  });

  const protection = input.protectionEnabled && (input.takeProfitPrice?.trim() || input.stopLossPrice?.trim()) ? {
    ...(input.takeProfitPrice?.trim() ? { takeProfitPriceExact: protectionPrice(input.takeProfitPrice.trim(), szDecimals) ?? '' } : {}),
    ...(input.stopLossPrice?.trim() ? { stopLossPriceExact: protectionPrice(input.stopLossPrice.trim(), szDecimals) ?? '' } : {}),
  } : undefined;
  let availability = orderUnavailable({
    accountUnavailable,
    marketStatus: facts.market.status,
    account,
    position,
    closeMode,
    marginMode: input.marginMode,
    isLong,
    orderType: input.orderType,
    slippagePercent: input.slippagePercent,
    hasAmount,
    hasExecutionPrice,
    market,
    szDecimals,
    orderPriceExact,
    orderSizeExact,
    maxOrderNotional,
    executableNotional,
    fullClose,
    symbol,
  });

  if (!availability && hasExecutionPrice && protection &&
      (closeMode || !validProtection(protection, orderPriceExact, isLong, szDecimals))) {
    availability = { code: 'invalid-protection', params: { min: PERPS_MIN_ORDER_NOTIONAL, symbol } };
  }

  const submittable =
    facts.market.status === 'ready' &&
    // 单资产容量不包含持仓；首次账户快照到达前，无法检查反向仓位。
    !!account &&
    hasAmount &&
    !availability &&
    hasExecutionPrice &&
    new BigNumber(preview?.sizeExact ?? 0).isGreaterThan(0);

  return {
    preview,
    availability,
    intent:
      submittable && market
        ? {
            market: {
              key: market.key,
              coin: market.coin,
              dex: market.dex,
              assetId: market.assetId,
              szDecimals: market.szDecimals,
              maxLeverage: market.maxLeverage,
              marginMode: market.marginMode,
            },
            operation,
            ...(protection ? { protection } : {}),
            side: input.side,
            referencePriceExact: orderPriceExact,
            requestedSizeExact: orderSizeExact,
            leverage: input.leverage,
            marginMode: closeMode && position ? position.leverageType : input.marginMode,
            orderType: input.orderType,
            maxSlippagePercent: input.slippagePercent,
          }
        : null,
    submittable,
    market,
    position,
    symbol,
    isLong,
    closeMode,
    operation,
    fullClose,
    increasesPosition,
    availableExact,
    positionSizeExact,
    orderPriceExact,
    orderSizeExact,
    percentBaseExact: percentBase.toFixed(),
    amountSliderPercent:
      input.activePercent !== null
        ? input.activePercent
        : !percentBase.isGreaterThan(0) || !hasAmount
        ? 0
        : Math.max(
            0,
            Math.min(
              100,
              amountExact.dividedBy(percentBase).times(100).toNumber()
            )
          ),
    leverageSliderPercent: leverageSliderPercent(
      input.leverage,
      market?.maxLeverage
    ),
    feeRates,
    // 读不到部署方倍数的 HIP-3 市场，照报账户费率等于把一个明知不对的数字摆到屏幕上，
    // 所以这一行改为如实说明。它不拦订单：手续费并不改变订单本身。
    feeEstimateUnavailable: marketRates === null,
    // 市价单必定吃单，所以 taker 费率就是完整答案。GTC 限价单通常挂着以 maker 成交，
    // 但它进场时也可能直接吃单，所以两者都显示，而不是挑一个。
    quotesBothFeeSides: input.orderType === 'limit',
    makerFeeIsRebate: new BigNumber(makerRate).plus(builderRate).isLessThan(0),
  };
}

/**
 * 表单是否仍然持有当初取基准时的那份意图。
 *
 * 基准存放在页面上 —— 本模块不保存任何东西 —— 但这个比较属于这里，紧挨着它所比对的成交价。
 */
export function intentUnchanged(
  baseline: PerpsReviewBaseline | null,
  input: PerpsOrderInput
): boolean {
  return (
    !!baseline &&
    baseline.amount === input.amount &&
    baseline.limitPrice === input.limitPrice &&
    baseline.side === input.side &&
    baseline.orderType === input.orderType &&
    baseline.leverage === input.leverage &&
    baseline.marginMode === input.marginMode &&
    !!baseline.protectionEnabled === !!input.protectionEnabled &&
    (baseline.takeProfitPrice ?? '') === (input.takeProfitPrice ?? '') &&
    (baseline.stopLossPrice ?? '') === (input.stopLossPrice ?? '') &&
    baseline.slippagePercent === input.slippagePercent &&
    baseline.mode === input.mode
  );
}

/**
 * 行情是否仍在用户同意的窗口之内。
 *
 * 在解锁钱包之前检查，这样跑飞的行情会在用户还有机会修改订单时就被拒绝，而不是等他们已经
 * 签完名之后。限价单自己定价、不会漂移，所以这个检查在那里是空转 —— 本该如此。
 */
export function withinReviewedSlippage(
  baseline: PerpsReviewBaseline | null,
  facts: PerpsOrderFacts,
  input: PerpsOrderInput
): boolean {
  const market = facts.market.status === 'ready' ? facts.market.market : null;
  return !exceedsMaxSlippage(
    baseline?.priceExact,
    executionPriceExact(market, input),
    input.slippagePercent
  );
}

/**
 * 用于计算数量、保证金和强平价的价格，也是市价单 IOC 限价所依据的参考价。
 *
 * 市价单按盘口中间价定价，与 Hyperliquid 自家前端一致。标记价格是按预言机加权的价格，
 * 可能落在价差之外，用它会把滑点窗口从真正可成交的价格上挪开。
 */
function executionPriceExact(
  market: PerpsMarket | null,
  input: PerpsOrderInput
): string {
  if (input.orderType === 'limit') {
    const value = new BigNumber(input.limitPrice || 0);
    return value.isFinite() && value.isGreaterThan(0) ? value.toFixed() : '0';
  }
  return market?.midPxExact || '0';
}

/** 把金额输入框当作数字来读，无论它此刻装的是什么输到一半的文本。 */
function typedAmount(amount: string): BigNumber {
  const value = new BigNumber(amount || 0);
  return value.isFinite() ? value : new BigNumber(0);
}

/** 精确的有符号数量，按市场最小变动单位向下取整，且不经过 Number 中转。 */
function submittedSize(params: {
  market: PerpsMarket | null;
  position: PerpsPosition | null;
  closeMode: boolean;
  fullClose: boolean;
  hasAmount: boolean;
  hasExecutionPrice: boolean;
  amountExact: BigNumber;
  orderPriceExact: string;
}): string {
  const {
    market,
    position,
    closeMode,
    fullClose,
    hasAmount,
    hasExecutionPrice,
    amountExact,
    orderPriceExact,
  } = params;
  if (!market || !hasAmount || !hasExecutionPrice) {
    return '0';
  }
  const requested = perpsSizeAtLot(
    amountExact.dividedBy(orderPriceExact),
    market.szDecimals
  );
  if (!closeMode || !position) {
    return requested;
  }
  const held = new BigNumber(position.sziExact).absoluteValue();
  // 全平必须原封不动地保住交易场所上报的数量：把两位小数的美元显示值再通过价格换算回去，
  // 可能会向下少算一个最小变动单位，留下一个并非本意的零头仓位。
  if (fullClose) {
    return held.toFixed();
  }
  // 部分平仓的数量按成交参考价换算，而它可以离标记价很远 —— 一个明显低于标记价的限价，
  // 会把「平掉 $500」换算成比整个仓位还大的数量。多出来的部分 reduce-only 本来就不会成交，
  // 但它会让预览里的比例、手续费和释放的保证金全部虚高，所以在这里就收住。
  return BigNumber.minimum(requested, held).toFixed();
}

/**
 * 这个市场上实际收取的费率。
 *
 * `userFees` 报的是账户费率 —— 成交量档位、质押和推荐折扣都已算在里面 —— 对标准永续它就是
 * 完整答案。HIP-3 市场按 Hyperliquid 公布的公式（Fees → Fee formula for developers）再乘两项：
 * 部署方倍数 `deployerFeeScale < 1 ? deployerFeeScale + 1 : deployerFeeScale × 2`，以及 growth
 * mode 的一折。返佣只打 growth mode 那一折、不乘部署方倍数：部署方分走的是收上来的费，返佣则是
 * 交易场所付出去的钱。
 *
 * 公式里的 aligned quote token 调整没有计入：它只作用于以 aligned 稳定币为抵押的 DEX，而本版本
 * 启用的 `xyz` 以 USDC 为抵押；扩大 DEX 白名单时需要复核。builder 费用由 NeoLine 按单指定，与
 * 市场无关，原样保留。
 *
 * 读不到部署方倍数的 HIP-3 市场返回 null。
 */
function marketFeeRates(
  rates: PerpsOrderFeeRates,
  market: PerpsMarket | null
): PerpsOrderFeeRates | null {
  if (!market?.dex) {
    return rates;
  }
  if (market.deployerFeeScaleExact === null) {
    return null;
  }
  const deployerScale = new BigNumber(market.deployerFeeScaleExact);
  const hip3Scale = deployerScale.isLessThan(1)
    ? deployerScale.plus(1)
    : deployerScale.times(2);
  const growthScale = market.growthMode ? '0.1' : '1';
  const scaled = (rate: string, scale: BigNumber.Value) =>
    new BigNumber(rate).times(scale).times(growthScale).toFixed();
  return {
    takerRate: scaled(rates.takerRate, hip3Scale),
    makerRate: scaled(
      rates.makerRate,
      new BigNumber(rates.makerRate).isGreaterThan(0) ? hip3Scale : 1
    ),
    builderRate: rates.builderRate,
  };
}

/** 预览各行；在还没有东西可供报价时为 null。 */
function composePreview(params: {
  crossMarginAccount?: PerpsCrossMarginAccount | null;
  market: PerpsMarket | null;
  position: PerpsPosition | null;
  closeMode: boolean;
  hasAmount: boolean;
  leverage: number;
  marginMode: PerpsMarginMode;
  isLong: boolean;
  orderPriceExact: string;
  orderSizeExact: string;
  executableNotional: BigNumber;
  takerRate: string;
  builderRate: string;
  quoteReceive: boolean;
}): PerpsOrderPreview | null {
  const {
    market,
    position,
    closeMode,
    hasAmount,
    leverage,
    marginMode,
    isLong,
    orderPriceExact,
    orderSizeExact,
    executableNotional,
    takerRate,
    builderRate,
  } = params;
  if (!market || !hasAmount) {
    return null;
  }
  if (closeMode && position) {
    const closePreview = previewClosePosition({
      position,
      sizeExact: orderSizeExact,
      executionPriceExact: orderPriceExact,
      feeRate: takerRate,
      builderFeeRate: builderRate,
    });
    return {
      // 成交额、盈亏与费用按成交参考价估算；释放保证金仍按持仓比例。
      notionalExact: closePreview.closedValueExact,
      marginExact: closePreview.releasedMarginExact,
      closePnlExact: closePreview.closePnlExact,
      // 费率估不出时不报「预计收到」：那一行要把费用扣掉，而这笔费用并不知道。
      receiveExact: params.quoteReceive ? closePreview.receiveExact : null,
      feeExact: closePreview.feeExact,
      protocolFeeExact: closePreview.protocolFeeExact,
      builderFeeExact: closePreview.builderFeeExact,
      sizeExact: closePreview.sizeExact,
      // 平仓不会新开敞口，所以没有强平价可估算 —— 是「缺失」，不是零。
      liquidationPxExact: null,
    };
  }
  const preview = previewOrder({
    crossMarginAccount: params.crossMarginAccount,
    market,
    executionPriceExact: orderPriceExact,
    // 用按最小变动单位向下取整后的名义价值，而不是输入的那个：保证金和手续费是按真正
    // 到达交易场所的那个数量收取的。
    notionalExact: executableNotional,
    sizeExact: orderSizeExact,
    leverage,
    marginMode,
    isLong,
    feeRate: takerRate,
    builderFeeRate: builderRate,
    // 加到已有仓位上时，是作为合并后的一个仓位被强平的，
    // 所以估算必须由两者共同构建。
    position,
  });
  return { ...preview, sizeExact: orderSizeExact };
}

/**
 * 挡在这张表单与一笔已提交订单之间的那唯一一件事；没有时为 null。
 *
 * 永远只有一条：一次性列出所有异议的表单，会让用户猜先修哪个，所以这些检查是从「再怎么
 * 输入也解决不了的」排到「取决于金额的」。
 *
 * 这里的每一条都是客户端可判定条件（见根 CONTEXT）—— 身份、协议精度、正数金额、最小名义
 * 价值、reduce-only 方向、可用余额、市场状态，以及用户自己的滑点。别的都不属于这里：
 * 未平仓量上限、预言机偏离，以及盘口究竟能否成交，都归交易场所判断；按 ADR-0006，一个去
 * 猜这些的客户端拦下的是合法订单，而不是在避免亏损。那些会以拒绝的形式回来，由页面翻译。
 *
 * 用户还没填完的输入框不算一条原因 —— 空的金额或限价只是让按钮保持禁用，不出声。
 */
function orderUnavailable(params: {
  accountUnavailable: boolean;
  marketStatus: PerpsOrderMarketFacts['status'];
  account: PerpsAccount | null;
  position: PerpsPosition | null;
  closeMode: boolean;
  marginMode: PerpsMarginMode;
  isLong: boolean;
  orderType: PerpsOrderType;
  slippagePercent: number;
  hasAmount: boolean;
  hasExecutionPrice: boolean;
  market: PerpsMarket | null;
  szDecimals?: number;
  orderPriceExact: string;
  orderSizeExact: string;
  maxOrderNotional: BigNumber;
  executableNotional: BigNumber;
  fullClose: boolean;
  symbol: string;
}): PerpsOrderUnavailable | null {
  const {
    accountUnavailable,
    marketStatus,
    account,
    position,
    closeMode,
    marginMode,
    isLong,
    orderType,
    slippagePercent,
    hasAmount,
    hasExecutionPrice,
    market,
    orderPriceExact,
    orderSizeExact,
    maxOrderNotional,
    executableNotional,
    fullClose,
    symbol,
  } = params;
  const reason = (
    code: PerpsOrderUnavailableCode
  ): PerpsOrderUnavailable => ({
    code,
    params: { min: PERPS_MIN_ORDER_NOTIONAL, symbol },
  });

  if (accountUnavailable) {
    return reason('account-unavailable');
  }
  if (marketStatus === 'missing') {
    return reason('market-missing');
  }
  if (marketStatus === 'error') {
    return reason('market-error');
  }
  if (!closeMode && marginMode === 'cross' && market?.marginMode) {
    return reason('cross-margin-unavailable');
  }
  if (!closeMode && position && position.leverageType !== marginMode) {
    return reason('margin-mode-mismatch');
  }
  if (closeMode && account && !position) {
    return reason('no-position-to-close');
  }
  // 一笔无价可依的市价单。这不是数据源的错误状态：市场是活跃的，只是此刻没有双边盘口。
  // 标记价格不能替代它 —— 它可能落在价差之外。
  if (
    marketStatus === 'ready' &&
    orderType === 'market' &&
    !new BigNumber(market?.midPxExact ?? 0).isGreaterThan(0)
  ) {
    return reason('no-execution-price');
  }
  // 对话框会做钳制，但存储返回的是旧版本写进去的任意值。
  if (
    !Number.isFinite(slippagePercent) ||
    slippagePercent < PERPS_MIN_SLIPPAGE_PERCENT ||
    slippagePercent > PERPS_MAX_SLIPPAGE_PERCENT
  ) {
    return reason('slippage-out-of-range');
  }
  if (!hasAmount) {
    return null;
  }
  if (!closeMode) {
    // 「事实还没到」和「限价框还空着」都不是保证金不足 —— 它们是**还答不上来**。
    // 过去这里用 `insufficient-margin` 当兜底，于是切到限价、先填金额的用户被告知他的钱
    // 不够，而他缺的只是一个价格；市场帧还在路上时同理。按本页 CONTEXT：未填完的输入框
    // 不是一条原因，它只让按钮保持禁用 —— `submittable` 本来就要求 `hasExecutionPrice`
    // 和 `market.status === 'ready'`，所以这里安静下来并不会放行任何东西。
    if (!market || !hasExecutionPrice) {
      return null;
    }
    const maxSize = perpsSizeAtLot(
      maxOrderNotional.dividedBy(orderPriceExact),
      market.szDecimals
    );
    if (new BigNumber(orderSizeExact).isGreaterThan(maxSize)) {
      return reason('insufficient-margin');
    }
  }
  // 全平跳过本地最低额预检，最终是否接受由交易场所判定。
  if (
    hasExecutionPrice &&
    !(closeMode && fullClose) &&
    executableNotional.isLessThan(PERPS_MIN_ORDER_NOTIONAL)
  ) {
    return reason('below-minimum');
  }
  return null;
}

/**
 * 百分比按钮所度量的基数。
 *
 * 订单数量会向下吸附到市场的最小变动单位，所以真正挂得住的最大名义价值是量化之后的那个
 * —— 100% 必须落在那里，而不是落在原始购买力上，否则显示出来的金额本来也会被交易场所
 * 削掉。平仓则改为按仓位度量：它花的是敞口，不是抵押品。
 */
function percentBaseFor(params: {
  closeMode: boolean;
  market: PerpsMarket | null;
  position: PerpsPosition | null;
  maxOrderNotional: BigNumber;
  orderPriceExact: string;
}): BigNumber {
  const { closeMode, market, position, maxOrderNotional, orderPriceExact } =
    params;
  if (closeMode) {
    return new BigNumber(position?.positionValueExact ?? 0);
  }
  return market
    ? notionalAtLotSize(maxOrderNotional, orderPriceExact, market.szDecimals)
    : maxOrderNotional;
}

function leverageSliderPercent(leverage: number, maxLeverage?: number): number {
  const max = maxLeverage || 1;
  return max === 1 ? 100 : ((leverage - 1) / (max - 1)) * 100;
}

/**
 * 百分比按钮所代表的金额，向下取整到输入框显示的「分」。
 *
 * 绝不向上取整。基数本身已经是这个市场的最小变动单位所能表达的最大名义价值，所以把最后
 * 一分向上舍入，买到的就比交易场所允许的多一手，表单最终会拒绝自己的 100%。凡是一手价值
 * 不到半分钱的市场 —— 那些低价市场，kPEPE 和 kBONK 也在其中 —— 这都是常态而不是边界情况。
 */
export function amountForPercent(
  composition: PerpsOrderComposition,
  percent: number
): string {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return new BigNumber(composition.percentBaseExact)
    .times(clamped)
    .dividedBy(100)
    .decimalPlaces(AMOUNT_DECIMALS, BigNumber.ROUND_FLOOR)
    .toFixed();
}

//#region 订单算术
// 全部是 composeOrder 的实现，没有一个对外。围绕它们的那些决定 —— 跑哪一种预览、给输入的
// 名义价值定价还是给按手取整后的定价、仓位是否加入强平价估算 —— 就在它们旁边。
//
// 它们的行为在 spec 里从 composeOrder 的返回值上观察，而不是各自被直接调用：那样这个模块
// 的 interface 会是它实现的 2.6 倍宽，而每次内部重构都要撞碎一批不属于任何调用方的用例。
// 协议本身的舍入规则不在这里，在 `_lib/perps.ts`（`perpsSizeAtLot` / `perpsPriceDecimals`）。

/**
 * 行情是否已经离开用户同意的窗口。
 *
 * 最大滑点就是用户对价格的全部同意，所以它同时也是「用户审核过的价格是否仍然成立」的判据。
 * 两侧都按小数比较：在六位小数下，市场的波动幅度可能小于浮点比较能分辨的程度。
 *
 * 任意一侧的价格缺失或非正数都答 `true` —— 没有约定的价格可供度量，就不能据此签任何名。
 */
function exceedsMaxSlippage(
  reviewedPriceExact: PerpsExactValue,
  currentPriceExact: PerpsExactValue,
  maxSlippagePercent: number
): boolean {
  const reviewed = new BigNumber(reviewedPriceExact ?? 0);
  const current = new BigNumber(currentPriceExact ?? 0);
  if (
    !reviewed.isFinite() ||
    !reviewed.isGreaterThan(0) ||
    !current.isFinite() ||
    !current.isGreaterThan(0) ||
    !Number.isFinite(maxSlippagePercent)
  ) {
    return true;
  }
  return current
    .minus(reviewed)
    .absoluteValue()
    .dividedBy(reviewed)
    .times(100)
    .isGreaterThan(maxSlippagePercent);
}

/**
 * 把输入的限价量化到这个市场实际能报出的价位。
 *
 * 不符合 tick 的价格可能被交易场所拒绝。客户端先按协议精度舍入并回填，
 * 让用户看到实际用于签名的价格。
 *
 * 空输入框、只有一个减号或只有一个小数点的输入框，留给用户去填完：这些情况返回 `''`，
 * 而不是一个为零的价格。
 */
export function normalizeLimitPrice(
  value: PerpsExactValue,
  szDecimals?: number
): string {
  const price = new BigNumber(value ?? '');
  if (!price.isFinite() || !price.isGreaterThan(0)) {
    return '';
  }
  if (szDecimals === undefined) {
    return price.toFixed();
  }
  return price
    .decimalPlaces(
      perpsPriceDecimals(price, szDecimals),
      BigNumber.ROUND_HALF_UP
    )
    .toFixed();
}


/**
 * Hyperliquid 为这个资产按方向上报的自由抵押品。
 *
 * 这是一个以 USDC 计的保证金数字，不是名义价值：在没有仓位的账户上，无论链上签的是多少
 * 倍杠杆，`availableToTrade` 都与 `withdrawable` 完全相等。因此当表单预览另一个杠杆时，
 * 它绝不能被重新缩放 —— 杠杆是把它乘成购买力（见 `collateralToNotional`）。
 */
function availableToTradeForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide
): string {
  return data.availableToTrade[side === 'long' ? 0 : 1];
}

/**
 * 一笔抵押品的购买力：由杠杆相乘得到。
 *
 * 这里不预留 taker 手续费。Hyperliquid 自家表单的 100% 正好就是抵押品 × 杠杆 —— 交易场所
 * 已经在 `availableToTrade` 内部留了缓冲，在这里再扣一笔手续费只会低于它给的数字。
 */
function collateralToNotional(
  collateral: BigNumber.Value,
  leverage: number
): BigNumber {
  const value = new BigNumber(collateral || 0);
  return value.isFinite() && value.isGreaterThan(0)
    ? value.times(Math.max(1, leverage || 1))
    : new BigNumber(0);
}

/** 同时施加账户购买力和交易场所的单资产数量上限。 */
function maxOrderNotionalForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide,
  leverage: number,
  executionPrice: BigNumber.Value
): BigNumber {
  const collateral = new BigNumber(availableToTradeForSide(data, side));
  const notional = collateral.isFinite() && collateral.isGreaterThan(0)
    ? collateral.times(Math.max(1, leverage || 1))
    : new BigNumber(0);
  const price = new BigNumber(executionPrice || 0);
  if (!price.isFinite() || !price.isGreaterThan(0)) {
    return notional;
  }
  const sideIndex = side === 'long' ? 0 : 1;
  const positionCap = new BigNumber(data.maxTradeSzs[sideIndex]).times(price);
  // 零是一个权威的按方向容量，不是缺失值。只有上面成交价不可用时，
  // 才会跳过从基础数量到美元的换算。
  return positionCap.isFinite() && positionCap.isGreaterThanOrEqualTo(0)
    ? BigNumber.minimum(notional, positionCap)
    : notional;
}

/**
 * 修剪到市场最小变动单位真正能表达的名义价值：数量按 `szDecimals` 向下取整，因此可下单的
 * 名义价值就是取整后的数量再乘回价格。Hyperliquid 的百分比按钮落在这个值上，而不是原始
 * 购买力上 —— 4.80 USDC 在 10 倍杠杆下是 47.95，而不是 48.00。
 */
function notionalAtLotSize(
  notional: BigNumber.Value,
  price: BigNumber.Value,
  szDecimals: number
): BigNumber {
  const priceValue = new BigNumber(price || 0);
  const notionalValue = new BigNumber(notional || 0);
  if (!priceValue.isFinite() || !priceValue.isGreaterThan(0)) {
    return notionalValue;
  }
  return new BigNumber(
    perpsSizeAtLot(notionalValue.dividedBy(priceValue), szDecimals)
  ).times(priceValue);
}

/**
 * 从**真正会被提交的那个数量**出发，预览一次 reduce-only 平仓。
 *
 * 入参是数量而不是美元，这一点是要点：过去它按 `amount / positionValue` 自己算一遍比例，
 * 而那条算式的隐含价格是标记价，提交用的却是成交参考价（市价单的中间价，或用户输入的限价）。
 * 于是同一张表单上，屏幕显示的数量和签名里的数量出自两条不同的算式 —— 市价单差几个基点，
 * 限价单差多少全看那个限价离标记价多远。现在两者是同一个值。
 */
function previewClosePosition(params: {
  position: PerpsPosition;
  /** 这笔订单会提交的基础数量，与 `intent.requestedSizeExact` 是同一个值。 */
  sizeExact: string;
  executionPriceExact: string;
  /** Hyperliquid 自己的 taker 费率。 */
  feeRate: BigNumber.Value;
  /** NeoLine 的 builder 费率；没有配置 builder 时为零。 */
  builderFeeRate?: BigNumber.Value;
}): {
  sizeExact: string;
  closedValueExact: string;
  releasedMarginExact: string;
  closePnlExact: string | null;
  receiveExact: string | null;
  feeExact: string;
  protocolFeeExact: string;
  builderFeeExact: string;
} {
  const {
    position, sizeExact, executionPriceExact, feeRate, builderFeeRate = 0,
  } = params;
  const positionSize = new BigNumber(position?.sziExact ?? 0).absoluteValue();
  const size = new BigNumber(sizeExact || 0);
  if (!positionSize.isGreaterThan(0) || !size.isGreaterThan(0)) {
    return {
      sizeExact: '0',
      closedValueExact: '0',
      releasedMarginExact: '0',
      closePnlExact: null,
      receiveExact: null,
      feeExact: '0',
      protocolFeeExact: '0',
      builderFeeExact: '0',
    };
  }
  // 数量在到这里之前已经收在持仓以内，但仓位随时可能在下一帧变小，
  // 而一个大于 1 的比例会报出比账户实际拥有的还多的保证金和手续费。
  const fraction = BigNumber.minimum(1, size.dividedBy(positionSize));
  const closedSize = BigNumber.minimum(size, positionSize);
  const executionPrice = new BigNumber(executionPriceExact);
  const closedValue = closedSize.times(executionPrice);
  const protocolFee = closedValue.times(feeRate || 0);
  const builderFee = closedValue.times(builderFeeRate || 0);
  const fee = protocolFee.plus(builderFee);
  const releasedMargin = new BigNumber(position.marginUsedExact ?? 0)
    .absoluteValue()
    .times(fraction);
  const entry = new BigNumber(position.entryPxExact ?? NaN);
  const closePnl = executionPrice.isFinite() && executionPrice.isGreaterThan(0) && entry.isFinite()
    ? closedSize.times(executionPrice.minus(entry)).times(position.isLong ? 1 : -1)
    : null;
  // 逐仓的 marginUsed 已含标记价上的未实现盈亏，先扣掉它才是锁住的初始保证金。
  // 全仓的 marginUsed 就是初始保证金，盈亏在账户权益里，不在这一项里。
  const markPnl = new BigNumber(position.unrealizedPnlExact ?? NaN);
  const collateral = position.leverageType === 'isolated'
    ? (markPnl.isFinite() ? releasedMargin.minus(markPnl.times(fraction)) : null)
    : releasedMargin;
  const receive = closePnl && collateral?.isFinite()
    ? collateral.plus(closePnl).minus(fee)
    : null;
  return {
    sizeExact: size.toFixed(),
    closedValueExact: closedValue.toFixed(),
    releasedMarginExact: releasedMargin.toFixed(),
    closePnlExact: closePnl?.toFixed() ?? null,
    receiveExact: receive?.isFinite() ? receive.toFixed() : null,
    feeExact: fee.toFixed(),
    protocolFeeExact: protocolFee.toFixed(),
    builderFeeExact: builderFee.toFixed(),
  };
}

/**
 * 数量与费用用成交参考价，初始保证金用标记价。
 * 强平预估按所选模式的抵押品和分档维持保证金计算，未计未来手续费、资金费和成交滑点。
 */
function previewOrder(params: {
  crossMarginAccount?: PerpsCrossMarginAccount | null;
  market: PerpsMarket;
  /** 预期入场价；限价单绝不能使用当前的中间价。 */
  executionPriceExact?: BigNumber.Value | null;
  notionalExact: BigNumber.Value;
  sizeExact: string;
  leverage: number;
  marginMode: PerpsMarginMode;
  isLong: boolean;
  /** 以小数表示的 taker 费率，例如 4.5 个基点写作 0.00045。 */
  feeRate: BigNumber.Value;
  /** NeoLine 的 builder 费率；没有配置 builder 时为零。 */
  builderFeeRate?: BigNumber.Value;
  /** 当前市场的净仓位（如果有的话）。 */
  position?: PerpsPosition | null;
}): PerpsOrderPreview {
  const {
    market,
    executionPriceExact,
    notionalExact,
    sizeExact,
    leverage,
    marginMode,
    isLong,
    feeRate,
    builderFeeRate = 0,
    position = null,
  } = params;
  // 缺少双边盘口并不构成用标记价格顶替的理由：标记价格可能落在可成交流动性之外，
  // 绝不能由它来定义一笔订单。
  const price = new BigNumber(executionPriceExact ?? market.midPxExact ?? 0);
  const notional = new BigNumber(notionalExact || 0);
  const lev = new BigNumber(Math.max(1, leverage));
  const hasPrice = price.isFinite() && price.isGreaterThan(0);
  const size = new BigNumber(sizeExact);
  const mark = new BigNumber(market.markPxExact ?? NaN);
  const margin = mark.isFinite() && mark.isGreaterThan(0) && lev.isFinite()
    ? size.times(mark).dividedBy(lev)
    : null;
  let liquidationIsLong = isLong;
  let totalSize = size;
  let entryNotional = notional;
  let collateral = margin;
  // 全仓的强平取决于共享抵押品与其他仓位，不能用单仓逐仓公式估算。
  let canEstimate = marginMode === 'isolated' && hasPrice && !!margin;
  if (position) {
    const heldSize = new BigNumber(position.sziExact).absoluteValue();
    const heldEntry = new BigNumber(position.entryPxExact ?? NaN);
    const heldEquity = new BigNumber(position.marginUsedExact ?? NaN);
    const heldPnl = new BigNumber(position.unrealizedPnlExact ?? NaN);
    // marginUsed 已含未实现盈亏；还原抵押品后才能从入场价值推算权益。
    // 改杠杆可能同时调整已有逐仓保证金，未得到写入后的账户值时不能沿用旧保证金报价。
    canEstimate = canEstimate && position.leverageType === 'isolated' &&
      position.leverage === leverage && heldSize.isFinite() && heldSize.isGreaterThan(0) &&
      heldEntry.isFinite() && heldEntry.isGreaterThan(0) &&
      heldEquity.isFinite() && heldPnl.isFinite();
    if (position.isLong === isLong) {
      totalSize = size.plus(heldSize);
      entryNotional = notional.plus(heldSize.times(heldEntry));
      collateral = margin?.plus(heldEquity.minus(heldPnl)) ?? null;
    } else if (size.isLessThan(heldSize)) {
      // 反向成交按比例释放逐仓保证金，剩余仓位保留原入场价与方向。
      totalSize = heldSize.minus(size);
      entryNotional = totalSize.times(heldEntry);
      collateral = heldEquity.minus(heldPnl).times(totalSize).dividedBy(heldSize);
      liquidationIsLong = position.isLong;

    } else {
      // 超过已有仓位的部分才构成新方向敞口；恰好全平时没有强平价。
      totalSize = size.minus(heldSize);
      entryNotional = totalSize.times(price);
      collateral = margin?.times(totalSize).dividedBy(size) ?? null;
    }
  }
  if (canEstimate && totalSize.isGreaterThan(0)) {
    // Hyperliquid 的下单预估在权益不足时假设补足初始保证金；这不是实际补保证金操作。
    // https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations
    const remainingNotional = totalSize.times(mark);
    const tier = market.marginTiers?.slice().reverse().find(
      (item) => remainingNotional.isGreaterThanOrEqualTo(item.lowerBoundExact)
    );
    const initialMargin = remainingNotional.dividedBy(
      Math.min(leverage, tier?.maxLeverage ?? leverage)
    );
    const remainingPnl = remainingNotional.minus(entryNotional)
      .times(liquidationIsLong ? 1 : -1);
    collateral = BigNumber.maximum(collateral, initialMargin.minus(remainingPnl));
  }
  const liquidationPxExact = marginMode === 'cross'
    ? crossLiquidationPrice(
        params.crossMarginAccount, market.coin, size.times(isLong ? 1 : -1), price, mark, market.marginTiers
      )
    : canEstimate && size.isGreaterThan(0)
    ? isolatedLiquidationPrice(totalSize, entryNotional, collateral, liquidationIsLong, market.marginTiers)
    : null;

  const protocolFee = notional.times(feeRate || 0);
  const builderFee = notional.times(builderFeeRate || 0);

  return {
    notionalExact: notional.toFixed(),
    marginExact: margin?.toFixed() ?? null,
    sizeExact,
    liquidationPxExact,
    feeExact: protocolFee.plus(builderFee).toFixed(),
    protocolFeeExact: protocolFee.toFixed(),
    builderFeeExact: builderFee.toFixed(),
  };
}
//#endregion
