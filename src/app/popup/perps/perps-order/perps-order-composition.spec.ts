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
 * The arithmetic the order form is built on, exercised directly.
 *
 * These are internal to the composition module — the page only ever calls
 * `composeOrder` — but they are where the protocol's rounding rules live, and
 * an edge case is far cheaper to state here than to reach through a full
 * composition.
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
    // The per-asset size cap binds well before the collateral does here.
    expect(maxOrderNotionalForSide(data, 'long', 2).toNumber()).toBeCloseTo(
      0.5323 * 1895,
      8
    );
  });

  it('reads availableToTrade as collateral, not as a leverage-scaled notional', () => {
    // Verified against the API: on an account with no position, availableToTrade
    // equals withdrawable exactly while leverage sits at 20x. Previewing another
    // leverage must not move it.
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

    // 4.8 USDC at 3x buys 14.4 of notional, so a 10 USDC order fits — the old
    // leverage-scaling rejected it as insufficient margin.
    const max = maxOrderNotionalForSide(data, 'long', 3);
    expect(max.toNumber()).toBeCloseTo(14.4, 8);
    expect(max.isGreaterThan(10)).toBeTrue();

    expect(collateralToNotional(4.8, 10)).toBeCloseTo(48, 8);
    // Leverage below 1x cannot buy more than the collateral itself.
    expect(collateralToNotional(4.8, 0.5)).toBeCloseTo(4.8, 8);
  });

  it('trims the 100% notional to the market lot, as Hyperliquid does', () => {
    // Cross-checked against Hyperliquid's own form: 4.80 USDC at 10x with ETH
    // at 1925.57 shows 47.95, not the raw 48.00 — floor(48/1925.57) to four
    // decimals is 0.0249, which prices back out to 47.9467.
    expect(notionalAtLotSize(48, 1925.57, 4)).toBeCloseTo(0.0249 * 1925.57, 8);
    expect(Number(notionalAtLotSize(48, 1925.57, 4).toFixed(2))).toBe(47.95);

    // A whole-unit market cannot express any fraction of a contract.
    expect(notionalAtLotSize(48, 1925.57, 0)).toBeCloseTo(0, 8);
    // Without a usable price there is nothing to quantise against.
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

    // A zero price makes the per-asset cap zero, which means "not loaded yet"
    // rather than "no capacity" — pinning it to zero empties the % buttons.
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
    // The mark can sit outside the spread; the mid is what a market order is
    // actually priced from, so it must be what sizing falls back to.
    const preview = previewOrder({
      market: ethMarket({ markPxExact: '100', midPxExact: '80' }),
      notionalExact: '800',
      leverage: 2,
      isLong: true,
      feeRate: 0.00045,
    });

    expect(preview.sizeExact).toBe('10');

    // A market with no two-sided mid cannot be sized from the mark.
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
   * Adding to a position does not create a second one. The exchange marks the
   * merged position, so an estimate that priced this order on its own — with
   * only its own margin behind it — quotes a level the account is never
   * liquidated at.
   */
  describe('liquidation estimate when adding to a position', () => {
    /** 10 ETH long, entered at $100, held at 2x — so $500 of margin. */
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

    // Doubling a position at its own price and leverage changes nothing about
    // where it liquidates — the clearest check that the merge is arithmetic on
    // the whole position rather than on this order alone.
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

    // Buying higher drags the size-weighted entry up, so the merged level sits
    // above the position's own and below what this order would face alone.
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

    // The margin figure is still this order's own: it is what the order locks,
    // not what the merged position holds.
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

    // An order on the other side is a reduce or a reverse, and the order form
    // refuses to guess which — so there is nothing to merge with.
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

    // Below one lot there is no order to merge, and dividing by a zero size
    // would answer with an infinity rather than a price.
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
   * Max slippage is the whole of the user's consent about price, so it is also
   * what decides whether the price they reviewed still stands at submit time.
   */
  describe('exceedsMaxSlippage', () => {
    it('allows a move inside the tolerance, in either direction', () => {
      expect(exceedsMaxSlippage('100', '100.5', 1)).toBeFalse();
      expect(exceedsMaxSlippage('100', '99.5', 1)).toBeFalse();
    });

    // The boundary is the agreed limit, not one tick past it.
    it('allows a move that lands exactly on the tolerance', () => {
      expect(exceedsMaxSlippage('100', '101', 1)).toBeFalse();
      expect(exceedsMaxSlippage('100', '99', 1)).toBeFalse();
    });

    it('refuses a move past the tolerance', () => {
      expect(exceedsMaxSlippage('100', '101.01', 1)).toBeTrue();
      expect(exceedsMaxSlippage('100', '98.99', 1)).toBeTrue();
    });

    // Six-decimal markets move by amounts a float comparison rounds away.
    it('measures the move on the decimals, not on a float of them', () => {
      expect(exceedsMaxSlippage('0.000001', '0.00000106', 5)).toBeTrue();
      expect(exceedsMaxSlippage('0.000001', '0.00000104', 5)).toBeFalse();
    });

    // No price is not a price that has not moved.
    it('refuses when either side has no price at all', () => {
      expect(exceedsMaxSlippage(null, '100', 1)).toBeTrue();
      expect(exceedsMaxSlippage('100', null, 1)).toBeTrue();
      expect(exceedsMaxSlippage('0', '100', 1)).toBeTrue();
      expect(exceedsMaxSlippage('100', '0', 1)).toBeTrue();
      expect(exceedsMaxSlippage('100', '100', NaN)).toBeTrue();
    });
  });

  /**
   * The signed price has to be the price on screen, so the box is normalised
   * through the same rule the wire price is quantised against.
   */
  describe('normalizeLimitPrice', () => {
    it('quantises to the tighter of the tick and five significant figures', () => {
      // BTC (szDecimals 5) quotes one decimal, but five significant figures
      // bind first at this magnitude.
      expect(normalizeLimitPrice('63393.55', 5)).toBe('63394');
      // SOL (szDecimals 2) quotes four decimals; significance allows three.
      expect(normalizeLimitPrice('75.7565', 2)).toBe('75.757');
      // PUMP (szDecimals 0) quotes six, and the tick is what binds.
      expect(normalizeLimitPrice('0.0029794', 0)).toBe('0.002979');
    });

    // Running it twice must not keep moving the price, or the box would drift
    // every time it lost focus.
    it('is a no-op on a price it has already quantised', () => {
      ['63393.55', '75.7565', '0.0029794', '1886'].forEach((price) => {
        const once = normalizeLimitPrice(price, 2);
        expect(normalizeLimitPrice(once, 2)).toBe(once);
      });
    });

    // A box mid-edit belongs to the user; only a finished price is rewritten.
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
 * The form read as a whole: what it would submit, and the single reason it
 * may not. Every case here used to be stated by assigning fields on a
 * half-constructed page component and reading its getters.
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

  /** One market quoted flat at `price`, so a preview's arithmetic is visible. */
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
   * A lot worth less than half a cent — 36 of Hyperliquid's markets trade this
   * way — used to lose to the cent rounding: the base is already the largest
   * placeable notional, so rounding its last cent up bought one lot more than
   * the account could cover and 100% disabled its own submit button.
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

    // Max applies the confirmed 0.5% reserve before lot quantisation.
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
   * Hyperliquid measures its $10 floor against the order it receives, which is
   * the lot-floored size priced back out — $10 of a whole-coin market at $3.33
   * is three coins, or $9.99.
   */
  it('rejects an amount whose lot-floored notional falls under the $10 floor', () => {
    const f = facts({
      coin: 'SOME',
      market: priced('SOME', 3.33, 0),
      // Enough capacity that the margin check, which is asked first, passes.
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

    // 11 lots at 3.33 is 36.63, not the 39.90 that was typed.
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

  // A rebate pays the account, so the sign has to survive all the way out.
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
   * The exchange has no flip order: a reverse is |position| + amount on one
   * ticket. Reading a plain opposite-side order as one signs several times the
   * risk the form previewed, so the page asks what was meant instead.
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
    // The exchange's own figure is shown beside the estimate.
    expect(composed.showsCurrentLiquidationPrice).toBeTrue();
  });

  /**
   * Portfolio Margin's account figures are unusable, so an order that adds risk
   * cannot be sized or previewed. Closing reads the position instead, and a
   * position the user cannot exit from here is the one outcome worth avoiding
   * (ADR-0007).
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
   * The deployer's share on a HIP-3 market is not reported anywhere, so the fee
   * row must say so rather than quote the canonical rate — but it must not stop
   * the order, which the fee does not change.
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
    // A limit order prices itself, so the missing mid is not its problem.
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

/** The two questions a review baseline exists to answer. */
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
    // A percentage button that lands on the same amount changed nothing.
    expect(
      intentUnchanged(baseline, { ...formInput, activePercent: 50 })
    ).toBeTrue();
  });

  it('holds while the market stays inside the agreed window', () => {
    expect(withinReviewedSlippage(baseline, marketAt('102'), formInput)).toBeTrue();
    expect(withinReviewedSlippage(baseline, marketAt('104'), formInput)).toBeFalse();
  });

  /** A limit order prices itself, so it cannot drift out of its own window. */
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
