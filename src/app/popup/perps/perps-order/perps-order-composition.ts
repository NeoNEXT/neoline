import BigNumber from 'bignumber.js';

import {
  PerpsAccount,
  PerpsAccountState,
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsOrderPreview,
  PerpsOrderSide,
  PerpsOrderType,
  PerpsPosition,
  PerpsTradeIntent,
  PerpsTradeOrderIntent,
  PERPS_MAX_ORDER_BUFFER_FRACTION,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PERPS_MIN_ORDER_NOTIONAL,
  PERPS_MIN_SLIPPAGE_PERCENT,
  perpsPriceDecimals,
  perpsSizeAtLot,
} from '@popup/_lib/perps';
import { PerpsExactValue } from '../perps.util';

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
  takerRate: number;
  makerRate: number;
  /** 除非当前网络配置了 builder 地址，否则为零。 */
  builderRate: number;
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
  /** close 是减少已有仓位；open 涵盖开仓、加仓和减仓到某个数量。 */
  mode: 'open' | 'close';
  side: PerpsOrderSide;
  orderType: PerpsOrderType;
  amount: string;
  limitPrice: string;
  leverage: number;
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
  | 'account-unavailable'
  | 'market-missing'
  | 'market-error'
  | 'portfolio-margin'
  | 'cross-position'
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
  /** 用户审核时屏幕上的成交参考价。 */
  priceExact: string;
  amount: string;
  limitPrice: string;
  side: PerpsOrderSide;
  orderType: PerpsOrderType;
  leverage: number;
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
  showsCurrentLiquidationPrice: boolean;
  /** 该方向上的自由抵押品，取交易场所上报的值。 */
  availableExact: string;
  positionSizeExact: string;
  orderPriceExact: string;
  orderSizeExact: string;
  /** 百分比按钮所度量的名义价值基数。 */
  percentBase: number;
  /** 开仓时 100% 瞄准的目标：购买力减去那笔已确认的预留。 */
  bufferedMaxNotionalExact: string;
  amountSliderPercent: number;
  leverageSliderPercent: number;
  nearMarginLimit: boolean;
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
  input: PerpsOrderInput
): PerpsOrderComposition {
  const market = facts.market.status === 'ready' ? facts.market.market : null;
  const account = facts.account.account;
  const accountUnavailable = facts.account.availability === 'unavailable';
  const activeAssetData = facts.activeAssetData;
  const { takerRate, makerRate, builderRate } = facts.feeRates;

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

  const orderSizeExact = submittedSize({
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

  const closeFractionExact = new BigNumber(positionSizeExact).isGreaterThan(0)
    ? new BigNumber(orderSizeExact).dividedBy(positionSizeExact).toFixed()
    : '0';

  const operation: PerpsTradeIntent = closeMode
    ? fullClose
      ? 'close'
      : 'reduce'
    : position
    ? 'increase'
    : 'open';

  const increasesPosition =
    !closeMode && !!position && position.isLong === isLong;

  const availableExact = activeAssetData
    ? availableToTradeForSide(activeAssetData, input.side)
    : account?.availableBalanceExact ?? '0';

  const maxOrderNotional = activeAssetData
    ? maxOrderNotionalForSide(
        activeAssetData,
        input.side,
        input.leverage,
        orderPriceExact
      )
    : new BigNumber(collateralToNotional(availableExact, input.leverage));

  const percentBase = percentBaseFor({
    closeMode,
    market,
    position,
    maxOrderNotional,
    orderPriceExact,
  });
  const bufferedMax = bufferedMaxNotional({
    market,
    maxOrderNotional,
    orderPriceExact,
  });

  const preview = composePreview({
    market,
    position,
    closeMode,
    fullClose,
    hasAmount,
    increasesPosition,
    amount: input.amount,
    leverage: input.leverage,
    isLong,
    orderPriceExact,
    orderSizeExact,
    executableNotional,
    closeFractionExact,
    takerRate,
    builderRate,
  });

  const availability = orderUnavailable({
    accountUnavailable,
    marketStatus: facts.market.status,
    account,
    position,
    closeMode,
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

  const submittable =
    facts.market.status === 'ready' &&
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
            },
            operation,
            side: input.side,
            referencePriceExact: orderPriceExact,
            requestedSizeExact: orderSizeExact,
            leverage: input.leverage,
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
    showsCurrentLiquidationPrice:
      increasesPosition && !!position?.liquidationPxExact,
    availableExact,
    positionSizeExact,
    orderPriceExact,
    orderSizeExact,
    percentBase,
    bufferedMaxNotionalExact: bufferedMax.toFixed(),
    amountSliderPercent:
      input.activePercent !== null
        ? input.activePercent
        : !percentBase || !hasAmount
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
    // 购买力的最后一丝余量：在审核与成交之间，账户被行情反向跳动一下，
    // 这笔订单就过不了保证金检查。
    nearMarginLimit:
      !closeMode &&
      !!market &&
      amountExact.isGreaterThan(bufferedMax) &&
      amountExact.isLessThanOrEqualTo(maxOrderNotional),
    // HIP-3 DEX 会在账户费率之上再抽走部署方自己的一份，而 `userFees` 里什么都不报。
    // 在这里照报标准永续的费率，等于把一个明知偏低的数字摆到屏幕上，所以这一行改为如实说明。
    feeEstimateUnavailable: !!market?.dex,
    // 市价单必定吃单，所以 taker 费率就是完整答案。GTC 限价单通常挂着以 maker 成交，
    // 但它进场时也可能直接吃单，所以两者都显示，而不是挑一个。
    quotesBothFeeSides: input.orderType === 'limit',
    makerFeeIsRebate: makerRate + builderRate < 0,
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
  // 全平必须原封不动地保住交易场所上报的数量：把两位小数的美元显示值再通过价格换算回去，
  // 可能会向下少算一个最小变动单位，留下一个并非本意的零头仓位。
  if (closeMode && position && fullClose) {
    return new BigNumber(position.sziExact).absoluteValue().toFixed();
  }
  return perpsSizeAtLot(
    amountExact.dividedBy(orderPriceExact),
    market.szDecimals
  );
}

/** 预览各行；在还没有东西可供报价时为 null。 */
function composePreview(params: {
  market: PerpsMarket | null;
  position: PerpsPosition | null;
  closeMode: boolean;
  fullClose: boolean;
  hasAmount: boolean;
  increasesPosition: boolean;
  amount: string;
  leverage: number;
  isLong: boolean;
  orderPriceExact: string;
  orderSizeExact: string;
  executableNotional: BigNumber;
  closeFractionExact: string;
  takerRate: number;
  builderRate: number;
}): PerpsOrderPreview | null {
  const {
    market,
    position,
    closeMode,
    fullClose,
    hasAmount,
    increasesPosition,
    amount,
    leverage,
    isLong,
    orderPriceExact,
    orderSizeExact,
    executableNotional,
    closeFractionExact,
    takerRate,
    builderRate,
  } = params;
  if (!market || !hasAmount) {
    return null;
  }
  if (closeMode && position) {
    const closePreview = previewClosePosition({
      position,
      notionalExact: amount,
      szDecimals: market.szDecimals,
      feeRate: takerRate,
      builderFeeRate: builderRate,
      fullClose,
    });
    return {
      notionalExact: new BigNumber(position.positionValueExact)
        .times(closeFractionExact)
        .toFixed(),
      marginExact: closePreview.releasedMarginExact,
      feeExact: closePreview.feeExact,
      protocolFeeExact: closePreview.protocolFeeExact,
      builderFeeExact: closePreview.builderFeeExact,
      sizeExact: closePreview.sizeExact,
      // 平仓不会新开敞口，所以没有强平价可估算 —— 是「缺失」，不是零。
      liquidationPxExact: null,
    };
  }
  const preview = previewOrder({
    market,
    executionPriceExact: orderPriceExact,
    // 用按最小变动单位向下取整后的名义价值，而不是输入的那个：保证金和手续费是按真正
    // 到达交易场所的那个数量收取的。
    notionalExact: executableNotional,
    leverage,
    isLong,
    feeRate: takerRate,
    builderFeeRate: builderRate,
    // 加到已有仓位上时，是作为合并后的一个仓位被强平的，
    // 所以估算必须由两者共同构建。
    position: increasesPosition ? position : null,
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
  // 组合保证金账户的永续清算所数字没有意义，所以在这类账户上，增加风险的订单既不能换算
  // 数量也不能预览（ADR-0007）。平仓是另一个问题：reduce-only 的平仓读的是仓位而不是账户
  // 数字，拒绝它会让用户守着一份只能到别处才退得掉的风险。
  if (!closeMode && account?.abstractionMode === 'portfolioMargin') {
    return reason('portfolio-margin');
  }
  // NeoLine 只开逐仓订单，无法改动一个存续中的全仓仓位。
  if (!closeMode && position?.leverageType === 'cross') {
    return reason('cross-position');
  }
  // 针对已持有仓位下的反方向订单不会被读作反手（见页面 CONTEXT 中的隐式翻转）：交易场所
  // 没有「翻转」这种订单，所以改为直接问用户本意是什么。
  if (!closeMode && position && position.isLong !== isLong) {
    return reason(position.isLong ? 'holding-long' : 'holding-short');
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
    if (!market || !hasExecutionPrice) {
      return reason('insufficient-margin');
    }
    const maxSize = perpsSizeAtLot(
      maxOrderNotional.dividedBy(orderPriceExact),
      market.szDecimals
    );
    if (new BigNumber(orderSizeExact).isGreaterThan(maxSize)) {
      return reason('insufficient-margin');
    }
  }
  // 全平是例外：交易场所允许仓位以任意数量退出。
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
}): number {
  const { closeMode, market, position, maxOrderNotional, orderPriceExact } =
    params;
  if (closeMode) {
    return Number(position?.positionValueExact ?? 0);
  }
  return market
    ? notionalAtLotSize(maxOrderNotional, orderPriceExact, market.szDecimals)
    : maxOrderNotional.toNumber();
}

/**
 * 扣掉那笔已确认预留后的购买力，并重新按最小变动单位量化。
 *
 * 100% 瞄准的是这里而不是原始最大值：账户数字会随标记价格在点击与成交之间浮动，而一笔正好
 * 卡在上限的订单，只要行情反向跳动一下就过不了保证金检查。
 */
function bufferedMaxNotional(params: {
  market: PerpsMarket | null;
  maxOrderNotional: BigNumber;
  orderPriceExact: string;
}): BigNumber {
  const { market, maxOrderNotional, orderPriceExact } = params;
  if (!market) {
    return new BigNumber(0);
  }
  const buffered = maxOrderNotional.times(
    new BigNumber(1).minus(PERPS_MAX_ORDER_BUFFER_FRACTION)
  );
  const size = perpsSizeAtLot(
    buffered.dividedBy(orderPriceExact),
    market.szDecimals
  );
  return new BigNumber(size).times(orderPriceExact);
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
  const amount =
    clamped === 100 && !composition.closeMode
      ? new BigNumber(composition.bufferedMaxNotionalExact)
      : new BigNumber(composition.percentBase).times(clamped).dividedBy(100);
  return amount.decimalPlaces(AMOUNT_DECIMALS, BigNumber.ROUND_FLOOR).toFixed();
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
 * Hyperliquid 不会拒绝一个不在最小变动价位上的价格，它会把它舍入 —— 于是一张接受了
 * `1234.567` 的表单，在一个只报一位小数的市场上签的是 `1234.5`，屏幕上却还显示着用户输入
 * 的数字。在失焦时跑一遍这个函数并把结果写回输入框，就能让屏幕上的价格和签名里的价格是
 * 同一个值。
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
      perpsPriceDecimals(price.toNumber(), szDecimals),
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
): number {
  const value = new BigNumber(collateral || 0);
  return value.isFinite() && value.isGreaterThan(0)
    ? value.times(Math.max(1, leverage || 1)).toNumber()
    : 0;
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
): number {
  const priceValue = new BigNumber(price || 0);
  const notionalValue = new BigNumber(notional || 0);
  if (!priceValue.isFinite() || !priceValue.isGreaterThan(0)) {
    return notionalValue.toNumber();
  }
  return new BigNumber(
    perpsSizeAtLot(notionalValue.dividedBy(priceValue), szDecimals)
  )
    .times(priceValue)
    .toNumber();
}

/**
 * 用真实的有符号仓位数量来预览一次 reduce-only 平仓。
 *
 * 全平必须原封不动地保住交易场所上报的 `szi`。把两位小数的美元显示值再通过实时标记价格
 * 换算回去，可能会向下少算一个最小变动单位，留下一个并非本意的零头仓位。
 */
function previewClosePosition(params: {
  position: PerpsPosition;
  /** 请求平掉的名义价值，以美元计；设置了 `fullClose` 时忽略。 */
  notionalExact: BigNumber.Value;
  szDecimals: number;
  /** Hyperliquid 自己的 taker 费率。 */
  feeRate: BigNumber.Value;
  /** NeoLine 的 builder 费率；没有配置 builder 时为零。 */
  builderFeeRate?: BigNumber.Value;
  fullClose: boolean;
}): {
  sizeExact: string;
  releasedMarginExact: string;
  feeExact: string;
  protocolFeeExact: string;
  builderFeeExact: string;
} {
  const {
    position,
    notionalExact,
    szDecimals,
    feeRate,
    builderFeeRate = 0,
    fullClose,
  } = params;
  const positionSize = new BigNumber(position?.sziExact ?? 0).absoluteValue();
  const positionValue = new BigNumber(
    position?.positionValueExact ?? 0
  ).absoluteValue();
  if (!positionSize.isGreaterThan(0) || !positionValue.isGreaterThan(0)) {
    return {
      sizeExact: '0',
      releasedMarginExact: '0',
      feeExact: '0',
      protocolFeeExact: '0',
      builderFeeExact: '0',
    };
  }
  const requestedFraction = fullClose
    ? new BigNumber(1)
    : BigNumber.minimum(
        1,
        BigNumber.maximum(
          0,
          new BigNumber(notionalExact || 0).dividedBy(positionValue)
        )
      );
  const sizeExact = fullClose
    ? positionSize.toFixed()
    : perpsSizeAtLot(positionSize.times(requestedFraction), szDecimals);
  // 上面按最小变动单位取整只会让请求变小，所以手续费和释放的保证金要跟随真正实现的那个
  // 比例 —— 而不是当初请求的那个。
  const actualFraction = BigNumber.minimum(
    1,
    new BigNumber(sizeExact).dividedBy(positionSize)
  );
  const closedValue = positionValue.times(actualFraction);
  const protocolFee = closedValue.times(feeRate || 0);
  const builderFee = closedValue.times(builderFeeRate || 0);
  return {
    sizeExact,
    releasedMarginExact: new BigNumber(position.marginUsedExact ?? 0)
      .absoluteValue()
      .times(actualFraction)
      .toFixed(),
    feeExact: protocolFee.plus(builderFee).toFixed(),
    protocolFeeExact: protocolFee.toFixed(),
    builderFeeExact: builderFee.toFixed(),
  };
}

/**
 * 一笔加到已有仓位上的订单，最终留下的那个逐仓仓位。
 *
 * 入场价按数量加权，因为交易场所保留的就是这个：一半在 $100 买入、一半在 $120 买入的仓位，
 * 会作为一个入场价 $110 的仓位被强平。保证金相加也是同样的道理 —— 已经缴纳的抵押品仍然
 * 支撑着合并后的仓位。
 *
 * 凡是没有东西可合并时都返回 `null`：没有仓位、仓位在另一侧（此时下单表单会拒绝，而不是
 * 把它读成反手），或者订单小到够不上一个最小变动单位。
 */
function mergedPositionForLiquidation(params: {
  position: PerpsPosition | null;
  isLong: boolean;
  entryExact: BigNumber;
  sizeExact: string;
  marginExact: BigNumber;
}): { entry: BigNumber; size: BigNumber; margin: BigNumber } | null {
  const { position, isLong, entryExact, sizeExact, marginExact } = params;
  const heldSize = new BigNumber(position?.sziExact ?? 0).absoluteValue();
  const orderSize = new BigNumber(sizeExact || 0);
  if (
    !position ||
    position.isLong !== isLong ||
    !heldSize.isGreaterThan(0) ||
    !orderSize.isGreaterThan(0)
  ) {
    return null;
  }
  const heldEntry = new BigNumber(position.entryPxExact || 0);
  if (!heldEntry.isFinite() || !heldEntry.isGreaterThan(0)) {
    return null;
  }
  const size = heldSize.plus(orderSize);
  return {
    entry: heldEntry
      .times(heldSize)
      .plus(entryExact.times(orderSize))
      .dividedBy(size),
    size,
    margin: new BigNumber(position.marginUsedExact || 0)
      .absoluteValue()
      .plus(marginExact),
  };
}

/**
 * 本地估算一笔市价单会花多少钱、以及会在哪里被强平。
 *
 * 强平价的估算假定这是一个只由自身保证金支撑的逐仓仓位，维持保证金率按 Hyperliquid 的
 * 规则固定为 1/(2 × 市场最大杠杆)。订单都是以逐仓下的（见 perps-order.component），
 * 所以这与交易场所实际生效的值一致；它仍然忽略手续费和资金费，因此把它当作一个接近的
 * 估算，而不是精确数字。
 *
 * 当这笔订单是加到账户已有的敞口上时要传入 `position`：交易场所强平的是合并后的仓位，
 * 而不是这笔订单本身，所以一个忽略已有数量和保证金的估算，报出的会是一个账户永远不会在
 * 那里被强平的价格。
 */
function previewOrder(params: {
  market: PerpsMarket;
  /** 预期入场价；限价单绝不能使用当前的中间价。 */
  executionPriceExact?: BigNumber.Value | null;
  notionalExact: BigNumber.Value;
  leverage: number;
  isLong: boolean;
  /** 以小数表示的 taker 费率，例如 4.5 个基点写作 0.00045。 */
  feeRate: BigNumber.Value;
  /** NeoLine 的 builder 费率；没有配置 builder 时为零。 */
  builderFeeRate?: BigNumber.Value;
  /** 这笔订单要加到的同方向仓位（如果有的话）。 */
  position?: PerpsPosition | null;
}): PerpsOrderPreview {
  const {
    market,
    executionPriceExact,
    notionalExact,
    leverage,
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
  const sizeExact = hasPrice
    ? perpsSizeAtLot(notional.dividedBy(price), market.szDecimals)
    : '0';

  // 维持保证金率是「最大杠杆下起始保证金」的一半，
  // 与用户为这笔订单选的杠杆无关。
  const maintenanceFraction = new BigNumber(1).dividedBy(
    new BigNumber(2).times(market.maxLeverage)
  );
  const side = isLong ? 1 : -1;
  const denominator = new BigNumber(1).minus(maintenanceFraction.times(side));
  const marginExact = notional.dividedBy(lev);
  const merged = mergedPositionForLiquidation({
    position,
    isLong,
    entryExact: price,
    sizeExact,
    marginExact,
  });
  const liquidationPx = merged
    ? // 交易场所按一个逐仓仓位计算保证金：把这笔订单的数量和保证金加到已有的上面，
      // 入场价取按数量加权的平均值。
      merged.entry.minus(
        merged.margin
          .minus(merged.entry.times(merged.size).times(maintenanceFraction))
          .times(side)
          .dividedBy(merged.size)
          .dividedBy(denominator)
      )
    : // 还没有持仓，所以只由比率决定，数量会被约掉。
      price.times(
        new BigNumber(1).minus(
          new BigNumber(1)
            .dividedBy(lev)
            .minus(maintenanceFraction)
            .times(side)
            .dividedBy(denominator)
        )
      );

  const protocolFee = notional.times(feeRate || 0);
  const builderFee = notional.times(builderFeeRate || 0);

  return {
    notionalExact: notional.toFixed(),
    marginExact: marginExact.toFixed(),
    sizeExact,
    // 没有正的估算值就没有东西可报。null 说的正是这件事；
    // 零则会声称这个仓位会在一个「什么都不是」的价格上被强平。
    liquidationPxExact:
      hasPrice && liquidationPx.isGreaterThan(0)
        ? liquidationPx.toFixed()
        : null,
    feeExact: protocolFee.plus(builderFee).toFixed(),
    protocolFeeExact: protocolFee.toFixed(),
    builderFeeExact: builderFee.toFixed(),
  };
}
//#endregion
