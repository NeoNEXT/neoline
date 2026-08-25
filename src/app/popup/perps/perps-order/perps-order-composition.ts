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
} from '@popup/_lib/perps';
import { PerpsExactValue } from '../perps.util';

/** USD amounts are typed and submitted to the cent. */
const AMOUNT_DECIMALS = 2;

/**
 * The market this form is about, and whether the feed has answered for it.
 *
 * A coin this build does not carry is a different answer from one whose feed
 * has not arrived, and the form has to say which — so the distinction is a
 * fact rather than something inferred from an absent market.
 */
export type PerpsOrderMarketFacts =
  | { status: 'loading' }
  | { status: 'ready'; market: PerpsMarket }
  | { status: 'missing' }
  | { status: 'error' };

/** Hyperliquid's own rates for this account, plus NeoLine's builder cut. */
export interface PerpsOrderFeeRates {
  takerRate: number;
  makerRate: number;
  /** Zero unless a builder address is configured for the active network. */
  builderRate: number;
}

/**
 * Everything the exchange currently says, as this page has read it.
 *
 * Read failures are facts too: `account` arrives exactly as the account state
 * stream produced it, availability included, so an account that could not be
 * read is never mistaken for an account holding nothing (root CONTEXT on
 * account state).
 */
export interface PerpsOrderFacts {
  /** Route coin, DEX prefix included on HIP-3 markets. */
  coin: string;
  market: PerpsOrderMarketFacts;
  account: PerpsAccountState<PerpsAccount>;
  /** Per-asset capacity, or null until `activeAssetData` arrives. */
  activeAssetData: PerpsActiveAssetData | null;
  feeRates: PerpsOrderFeeRates;
}

/**
 * What the user has typed and pressed. Nothing derived, nothing read back.
 *
 * `amount` and `limitPrice` are the boxes verbatim, half-typed text included:
 * ADR-0001 keeps signed values out of JavaScript floats, and a box on its way
 * from "1." to "1.25" must not be rewritten under the caret. Text that is not
 * yet a positive decimal simply reads as no amount at all.
 */
export interface PerpsOrderInput {
  /** Close reduces an existing position; open covers open, add and reduce-to. */
  mode: 'open' | 'close';
  side: PerpsOrderSide;
  orderType: PerpsOrderType;
  amount: string;
  limitPrice: string;
  leverage: number;
  slippagePercent: number;
  /** Set while a percentage button is what sized the order, null once typed. */
  activePercent: number | null;
}

/**
 * Why this order cannot be submitted, as a condition rather than a message.
 *
 * The page owns the wording: a code survives a rewritten string, and a module
 * spec that asserts on `'insufficient-margin'` is stating the rule rather than
 * pinning a translation key.
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
  /** Values the reason interpolates, when it takes any. */
  params: { min: number; symbol: string };
}

/** What the user approved, kept by the page for the moment they press submit. */
export interface PerpsReviewBaseline {
  /** The execution reference price on screen when the user reviewed. */
  priceExact: string;
  amount: string;
  limitPrice: string;
  side: PerpsOrderSide;
  orderType: PerpsOrderType;
  leverage: number;
  slippagePercent: number;
  mode: 'open' | 'close';
}

/** One reading of the form: what it would submit, and whether it may. */
export interface PerpsOrderComposition {
  /** Absent until there is an amount to preview. */
  preview: PerpsOrderPreview | null;
  /** The single reason submission is blocked, or null. */
  availability: PerpsOrderUnavailable | null;
  /**
   * The intent to hand the trade order module, or null when the facts and
   * input do not yet describe a submittable order.
   */
  intent: PerpsTradeOrderIntent | null;
  /**
   * Whether facts and input allow submission. The page adds its own transient
   * gates on top — a submission in flight is not a property of the order.
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
  /** Free collateral for this direction, as the exchange reports it. */
  availableExact: string;
  positionSizeExact: string;
  orderPriceExact: string;
  orderSizeExact: string;
  /** The notional a percentage button measures against. */
  percentBase: number;
  /** What 100% aims at when opening: buying power less the confirmed reserve. */
  bufferedMaxNotionalExact: string;
  amountSliderPercent: number;
  leverageSliderPercent: number;
  nearMarginLimit: boolean;
  feeEstimateUnavailable: boolean;
  quotesBothFeeSides: boolean;
  makerFeeIsRebate: boolean;
}

/**
 * Read the form once: preview, availability and the order it would submit.
 *
 * A pure mapping from current facts and current input, holding nothing between
 * calls. That is the point rather than an implementation detail — per ADR-0005
 * and ADR-0006 the page keeps a review baseline, not a frozen composite of the
 * account, the book and the fees, so every reading here is derived from what is
 * true now.
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

  // The position this form acts on. Derived here rather than passed in: it is
  // the account's answer for this market, not a separate fact the page could
  // hold a different opinion about.
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

  // The form displays two-decimal USD, so that rounded maximum must still mean
  // 100%; requiring it to equal the higher-precision API value leaves dust.
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

  // What the order is actually worth once its size floors to the market lot.
  // The typed amount overstates this by up to one lot, and the difference is
  // binding at both ends: Hyperliquid rejects an order under $10 measured this
  // way, and the margin and fee rows should quote the order being placed.
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
    // The last sliver of buying power, where a tick against the account
    // between review and fill costs the order its margin check.
    nearMarginLimit:
      !closeMode &&
      !!market &&
      amountExact.isGreaterThan(bufferedMax) &&
      amountExact.isLessThanOrEqualTo(maxOrderNotional),
    // A HIP-3 DEX takes the deployer's own share on top of the account rate,
    // and nothing in `userFees` reports it. Quoting the canonical rate here
    // would put a knowably low number on screen, so the row says so instead.
    feeEstimateUnavailable: !!market?.dex,
    // A market order always crosses, so the taker rate is the whole answer. A
    // GTC limit order usually rests and fills as maker, but it can also cross
    // on the way in, so both are shown rather than picking one.
    quotesBothFeeSides: input.orderType === 'limit',
    makerFeeIsRebate: makerRate + builderRate < 0,
  };
}

/**
 * Whether the form still holds the intent a baseline was taken from.
 *
 * The baseline lives on the page — this module holds nothing — but the
 * comparison belongs here, beside the execution price it is compared against.
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
 * Whether the market is still inside the window the user agreed to.
 *
 * Checked before the wallet is unlocked, so a market that ran away is refused
 * while the user still has an order to fix, rather than after they have already
 * signed one. A limit order prices itself and cannot drift, which makes this
 * inert there — as it should be.
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
 * Price used for size, margin and liquidation, and the reference a market
 * order's IOC limit is derived from.
 *
 * Market orders price off the book mid, as Hyperliquid's own front end does.
 * The mark is an oracle-weighted price that can sit outside the spread, so
 * using it would shift the slippage window off the prices actually on offer.
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

/** The amount box as a number, whatever half-typed text it currently holds. */
function typedAmount(amount: string): BigNumber {
  const value = new BigNumber(amount || 0);
  return value.isFinite() ? value : new BigNumber(0);
}

/** Exact signed size, floored to the market lot without a Number round-trip. */
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
  // A full close must preserve the exchange-reported size exactly: converting
  // the two-decimal USD display value back through the price can round down by
  // one lot and leave an unintended dust position.
  if (closeMode && position && fullClose) {
    return new BigNumber(position.sziExact).absoluteValue().toFixed();
  }
  return sizeAtLot(
    amountExact.dividedBy(orderPriceExact),
    market.szDecimals
  );
}

/** The preview rows, or null while there is nothing to quote them on. */
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
      // Closing does not open exposure, so there is no liquidation price to
      // estimate — absent, not zero.
      liquidationPxExact: null,
    };
  }
  const preview = previewOrder({
    market,
    executionPriceExact: orderPriceExact,
    // The lot-floored notional, not the typed one: margin and fee are charged
    // on the size that reaches the exchange.
    notionalExact: executableNotional,
    leverage,
    isLong,
    feeRate: takerRate,
    builderFeeRate: builderRate,
    // Adding to an open position liquidates as one merged position, so the
    // estimate has to be built from both.
    position: increasesPosition ? position : null,
  });
  return { ...preview, sizeExact: orderSizeExact };
}

/**
 * The one thing standing between this form and a submitted order, or null.
 *
 * Only ever one: a form that lists every objection at once leaves the user
 * guessing which to fix first, so the checks are ordered from the ones no
 * amount of typing can fix down to the ones that depend on the amount.
 *
 * Everything here is a client-decidable condition (root CONTEXT) — identity,
 * protocol precision, a positive amount, the minimum notional, reduce-only
 * direction, available balance, market state and the user's own slippage.
 * Nothing else belongs: open-interest caps, oracle deviation and whether the
 * book can actually fill are the exchange's to judge, and per ADR-0006 a
 * client that guesses at them blocks legitimate orders instead of preventing
 * losses. Those come back as rejections, which the page translates.
 *
 * A box the user has not finished filling in is not a reason — an empty amount
 * or limit price leaves the button disabled, silently.
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
  // Portfolio Margin's perps clearinghouse figures are meaningless, so an order
  // that adds risk cannot be sized or previewed on such an account (ADR-0007).
  // Closing is a different question: a reduce-only close reads the position,
  // not the account numbers, and refusing it would leave the user holding risk
  // they can only exit somewhere else.
  if (!closeMode && account?.abstractionMode === 'portfolioMargin') {
    return reason('portfolio-margin');
  }
  // NeoLine opens isolated orders and cannot change a live cross position.
  if (!closeMode && position?.leverageType === 'cross') {
    return reason('cross-position');
  }
  // An order against a position already held is not read as a reverse (see the
  // page CONTEXT on implicit flip): the exchange has no "flip" order, so the
  // user is asked which they meant instead.
  if (!closeMode && position && position.isLong !== isLong) {
    return reason(position.isLong ? 'holding-long' : 'holding-short');
  }
  if (closeMode && account && !position) {
    return reason('no-position-to-close');
  }
  // A market order with nothing to price against. Not an error state of the
  // feed: the market is live, it simply has no two-sided book right now. The
  // mark is not a substitute — it can sit outside the spread.
  if (
    marketStatus === 'ready' &&
    orderType === 'market' &&
    !new BigNumber(market?.midPxExact ?? 0).isGreaterThan(0)
  ) {
    return reason('no-execution-price');
  }
  // The dialog clamps, but storage answers with whatever an older build wrote.
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
    const maxSize = sizeAtLot(
      maxOrderNotional.dividedBy(orderPriceExact),
      market.szDecimals
    );
    if (new BigNumber(orderSizeExact).isGreaterThan(maxSize)) {
      return reason('insufficient-margin');
    }
  }
  // A full close is exempt: the exchange lets a position out at any size.
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
 * What the percentage buttons measure against.
 *
 * Order sizes snap down to the market's lot, so the largest notional that can
 * actually rest is the quantised one — 100% must land there, not on the raw
 * buying power, or the amount shown is one the exchange would trim anyway.
 * Closing measures against the position instead: it spends exposure, not
 * collateral.
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
 * Buying power with the confirmed reserve taken off, re-quantised to the lot.
 *
 * 100% aims here rather than at the raw maximum: the account figure moves with
 * the mark between the tap and the fill, and an order placed at exactly the
 * limit loses the margin check to a tick in the wrong direction.
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
  const size = sizeAtLot(
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
 * The amount a percentage button means, floored to the cent the box displays.
 *
 * Never rounded up. The base is already the largest notional this market's lot
 * can express, so rounding the last cent up buys one lot more than the exchange
 * allows and the form ends up rejecting its own 100%. Wherever a lot is worth
 * less than half a cent — the low-priced markets, kPEPE and kBONK among them —
 * that is a routine outcome rather than an edge case.
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

//#region order arithmetic
// Moved here from perps.util.ts: every one of these had this page as its only
// caller, and the decisions that surround them — which preview to run, whether
// to price the typed notional or the lot-floored one, whether a position joins
// the liquidation estimate — now sit beside them rather than a file away.

/**
 * Whether the market has left the window the user agreed to.
 *
 * Max slippage is the whole of the user's consent about price, so it is also
 * the test for whether the price they reviewed still stands. Both sides are
 * compared as decimals: at six decimals a market can move by less than a
 * float comparison can resolve.
 *
 * A missing or non-positive price on either side answers `true` — there is no
 * agreed price to measure against, so nothing may be signed against it.
 */
export function exceedsMaxSlippage(
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
 * A typed limit price quantised to what this market can actually quote.
 *
 * Hyperliquid does not reject an off-tick price, it rounds one — so a form that
 * accepts `1234.567` on a market quoting one decimal signs `1234.5` while still
 * showing the user the number they typed. Running this on blur and writing the
 * answer back into the box keeps the price on screen and the price in the
 * signature the same value.
 *
 * A box holding nothing, a minus sign or a lone decimal point is left for the
 * user to finish: those answer `''` rather than a zero price.
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
 * Free collateral Hyperliquid reports for this asset, per direction.
 *
 * This is a margin figure in USDC, not a notional: on an account with no
 * position `availableToTrade` equals `withdrawable` exactly, whatever leverage
 * is signed on-chain. It therefore must not be rescaled when the form previews
 * a different leverage — leverage multiplies it into buying power instead (see
 * `collateralToNotional`).
 */
export function availableToTradeForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide
): string {
  if (!data) {
    return '0';
  }
  return data.availableToTrade[side === 'long' ? 0 : 1];
}

/**
 * Buying power of some collateral: leverage multiplies it.
 *
 * No taker fee is set aside. Hyperliquid's own form sizes 100% at exactly
 * collateral × leverage — the exchange already keeps a buffer inside
 * `availableToTrade`, so deducting a fee here would just undershoot its number.
 */
export function collateralToNotional(
  collateral: BigNumber.Value,
  leverage: number
): number {
  const value = new BigNumber(collateral || 0);
  return value.isFinite() && value.isGreaterThan(0)
    ? value.times(Math.max(1, leverage || 1)).toNumber()
    : 0;
}

/** Apply both account buying power and the exchange's per-asset size cap. */
export function maxOrderNotionalForSide(
  data: PerpsActiveAssetData,
  side: PerpsOrderSide,
  leverage: number,
  executionPrice: BigNumber.Value = data?.markPx ?? 0
): BigNumber {
  const collateral = new BigNumber(availableToTradeForSide(data, side));
  const notional = collateral.isFinite() && collateral.isGreaterThan(0)
    ? collateral.times(Math.max(1, leverage || 1))
    : new BigNumber(0);
  if (!data) {
    return notional;
  }
  const price = new BigNumber(executionPrice || 0);
  if (!price.isFinite() || !price.isGreaterThan(0)) {
    return notional;
  }
  const sideIndex = side === 'long' ? 0 : 1;
  const positionCap = new BigNumber(data.maxTradeSzs[sideIndex]).times(price);
  // Zero is an authoritative per-side capacity, not a missing value. Only an
  // unavailable execution price above skips conversion from base size to USD.
  return positionCap.isFinite() && positionCap.isGreaterThanOrEqualTo(0)
    ? BigNumber.minimum(notional, positionCap)
    : notional;
}

/** Floor a decimal base size to the market lot without passing through Number. */
export function sizeAtLot(
  size: BigNumber.Value,
  szDecimals: number
): string {
  const value = new BigNumber(size || 0);
  if (!value.isFinite() || !value.isGreaterThan(0)) {
    return '0';
  }
  return value
    .decimalPlaces(Math.max(0, szDecimals), BigNumber.ROUND_FLOOR)
    .toFixed();
}

/**
 * Notional trimmed to what the market's lot size can actually express: sizes
 * floor to `szDecimals`, so the placeable notional is the floored size priced
 * back out. Hyperliquid's percentage buttons land on this value rather than on
 * the raw buying power — at 10x on 4.80 USDC that is 47.95, not 48.00.
 */
export function notionalAtLotSize(
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
    sizeAtLot(notionalValue.dividedBy(priceValue), szDecimals)
  )
    .times(priceValue)
    .toNumber();
}

/**
 * Preview a reduce-only close from the actual signed position size.
 *
 * A full close must preserve the exchange-reported `szi` exactly. Converting a
 * two-decimal USD display value back through the live mark can round down by one
 * lot and leave an unintended dust position.
 */
export function previewClosePosition(params: {
  position: PerpsPosition;
  /** Requested close notional in USD; ignored when `fullClose` is set. */
  notionalExact: BigNumber.Value;
  szDecimals: number;
  /** Hyperliquid's own taker fee rate. */
  feeRate: BigNumber.Value;
  /** NeoLine's builder fee rate; zero when no builder is configured. */
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
    : sizeAtLot(positionSize.times(requestedFraction), szDecimals);
  // The lot floor above can only shrink the request, so the realised fraction
  // is what the fee and released margin must follow — not what was asked for.
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
 * The isolated position an order leaves behind, when it adds to an open one.
 *
 * Entry is size-weighted because that is what the exchange keeps: half a
 * position bought at $100 and half at $120 is liquidated as one position
 * entered at $110. Margin adds up for the same reason — collateral already
 * posted still backs the merged position.
 *
 * Answers `null` whenever there is nothing to merge: no position, one on the
 * other side (which the order form refuses rather than reading as a reverse),
 * or an order too small to reach one lot.
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
 * Local estimate of what a market order would cost and where it would liquidate.
 *
 * Liquidation assumes an isolated position backed only by its own margin, with
 * the maintenance margin fraction fixed at 1/(2 × market max leverage) per
 * Hyperliquid's rule. Orders are placed isolated (see perps-order.component),
 * so this matches the exchange's binding value; it still ignores fees and
 * funding, so treat it as a close estimate rather than the exact figure.
 *
 * Pass `position` when the order adds to exposure the account already holds:
 * the exchange liquidates the merged position, not this order on its own, so
 * an estimate that ignored the existing size and margin would quote a price
 * the account will never be liquidated at.
 */
export function previewOrder(params: {
  market: PerpsMarket;
  /** Expected entry price; limit orders must not use the current mid price. */
  executionPriceExact?: BigNumber.Value | null;
  notionalExact: BigNumber.Value;
  leverage: number;
  isLong: boolean;
  /** Taker fee rate as a fraction, e.g. 0.00045 for 4.5bps. */
  feeRate: BigNumber.Value;
  /** NeoLine's builder fee rate; zero when no builder is configured. */
  builderFeeRate?: BigNumber.Value;
  /** Same-direction position this order adds to, if there is one. */
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
  // A missing two-sided book is not a licence to substitute mark price: the
  // mark can sit outside executable liquidity and must never define an order.
  const price = new BigNumber(executionPriceExact ?? market.midPxExact ?? 0);
  const notional = new BigNumber(notionalExact || 0);
  const lev = new BigNumber(Math.max(1, leverage));
  const hasPrice = price.isFinite() && price.isGreaterThan(0);
  const sizeExact = hasPrice
    ? sizeAtLot(notional.dividedBy(price), market.szDecimals)
    : '0';

  // Maintenance margin fraction is half the initial margin at MAX leverage,
  // regardless of the leverage the user picked for this order.
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
    ? // The exchange marks one isolated position: this order's size and margin
      // added to what is already there, entered at the size-weighted average.
      merged.entry.minus(
        merged.margin
          .minus(merged.entry.times(merged.size).times(maintenanceFraction))
          .times(side)
          .dividedBy(merged.size)
          .dividedBy(denominator)
      )
    : // Nothing held yet, so the ratio alone decides and the size cancels out.
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
    // No positive estimate means there is nothing to quote. Null says that;
    // zero would claim the position liquidates at a price of nothing.
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
