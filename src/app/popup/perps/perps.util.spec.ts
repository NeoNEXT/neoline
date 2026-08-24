import {
  availableToTradeForSide,
  chartPriceDecimals,
  clampDecimals,
  coinLogo,
  collateralToNotional,
  formatCompactUsd,
  formatFeeRatePercent,
  formatFillTime,
  formatFundingPercent,
  formatPrice,
  formatSignedPercent,
  formatSignedPrice,
  formatSize,
  formatUsd,
  formatBalance,
  exceedsMaxSlippage,
  isNegativeExact,
  MISSING_DISPLAY,
  maxOrderNotionalForSide,
  mergeCandles,
  normalizeLimitPrice,
  notionalAtLotSize,
  previewClosePosition,
  previewOrder,
  priceDecimals,
  sizeAtLot,
} from './perps.util';
import { PerpsPosition } from '@popup/_lib/perps';
import { ethCandle, ethMarket } from './perps.test-fixture';

describe('perps sign test', () => {
  it('answers on the decimal itself rather than on a float of it', () => {
    expect(isNegativeExact('-0.00000000000000000001')).toBeTrue();
    expect(isNegativeExact('-1.2789473684')).toBeTrue();
    expect(isNegativeExact('1.2789473684')).toBeFalse();
  });

  it('does not paint zero red', () => {
    expect(isNegativeExact('0')).toBeFalse();
    expect(isNegativeExact('-0')).toBeFalse();
  });

  it('gives a missing value no sign at all', () => {
    // `--` is the absence of a number, not a number that happens to be down.
    expect(isNegativeExact(null)).toBeFalse();
    expect(isNegativeExact(undefined)).toBeFalse();
    expect(isNegativeExact('')).toBeFalse();
    expect(isNegativeExact('not a number')).toBeFalse();
  });
});

describe('perps utilities', () => {
  // The amount field runs this on every keystroke, so a digit the transfer
  // cannot express never reaches the model in the first place.
  it('cuts amount text to the decimals a transfer can carry', () => {
    expect(clampDecimals('5.0000001', 6)).toBe('5.000000');
    expect(clampDecimals('12.3456789012', 8)).toBe('12.34567890');
    expect(clampDecimals('1.23', 6)).toBe('1.23');
    // A decimal point on its own has to survive, or it could never be typed.
    expect(clampDecimals('1.', 6)).toBe('1.');
    // Everything an amount is not: a currency mark, a sign, a second point.
    expect(clampDecimals('$12.5', 6)).toBe('12.5');
    expect(clampDecimals('-1.5', 6)).toBe('1.5');
    expect(clampDecimals('1.2.3', 6)).toBe('1.2');
    expect(clampDecimals('abc', 6)).toBe('');
    expect(clampDecimals('', 6)).toBe('');
    // A whole-unit token takes no decimal point at all.
    expect(clampDecimals('1.5', 0)).toBe('1');
  });

  // Hyperliquid lists 232 perps against a handful of bundled marks, so the CDN
  // is the normal path and the bundled map is the exception, not the reverse.
  it('resolves a coin mark, preferring the bundled asset', () => {
    expect(coinLogo('ETH')).toBe('assets/images/token/eth.webp');
    expect(coinLogo('BTC')).toBe('https://app.hyperliquid.xyz/coins/BTC.svg');
    expect(coinLogo('')).toBe('');
    expect(coinLogo(undefined)).toBe('');
  });

  // The Neo pair were bundled before the CDN was wired up; they are drawn there
  // like every other row, so the local copies no longer stand in for them.
  it('takes the Neo markets from the CDN like any other coin', () => {
    expect(coinLogo('NEO')).toBe('https://app.hyperliquid.xyz/coins/NEO.svg');
    expect(coinLogo('GAS')).toBe('https://app.hyperliquid.xyz/coins/GAS.svg');
  });

  // The CDN's path segments are case-sensitive: `btc.svg` is not `BTC.svg`.
  it('asks the CDN in the casing it answers to', () => {
    expect(coinLogo('btc')).toBe('https://app.hyperliquid.xyz/coins/BTC.svg');
  });

  // A HIP-3 mark is filed under the whole protocol coin. The bare symbol gets
  // the app's HTML shell, and re-casing the lowercase DEX name misses too.
  it('keeps the dex prefix, untouched, for a HIP-3 market', () => {
    expect(coinLogo('xyz:SNDK')).toBe(
      'https://app.hyperliquid.xyz/coins/xyz%3ASNDK.svg'
    );
    // Natural gas on a HIP-3 dex keeps its own mark, not Neo GAS's.
    expect(coinLogo('flx:GAS')).toBe(
      'https://app.hyperliquid.xyz/coins/flx%3AGAS.svg'
    );
    expect(coinLogo('GAS')).toBe('https://app.hyperliquid.xyz/coins/GAS.svg');
  });

  // `k` is the 1000x contract-size prefix, not part of the asset: kPEPE is
  // quoted in 1000-PEPE lots and the CDN files its mark under PEPE.
  it('drops the k multiplier prefix before asking for a mark', () => {
    expect(coinLogo('kPEPE')).toBe('https://app.hyperliquid.xyz/coins/PEPE.svg');
    expect(coinLogo('kBONK')).toBe('https://app.hyperliquid.xyz/coins/BONK.svg');
    // Not a multiplier: real symbols are uppercase throughout.
    expect(coinLogo('KAITO')).toBe('https://app.hyperliquid.xyz/coins/KAITO.svg');
  });

  it('formats dynamic fee rates without floating-point noise', () => {
    expect(formatFeeRatePercent(0.00045)).toBe('0.045%');
    expect(formatFeeRatePercent(0.000405)).toBe('0.0405%');
    expect(formatFeeRatePercent(0)).toBe('0%');
  });

  // The expectations below are real testnet values at their real `szDecimals`.
  // Users read this screen beside Hyperliquid's own, and a price that shows
  // 63,394 in one place and 63,393.5 in the other looks like disagreeing data.
  it('prices at the market tick, not at a magnitude band', () => {
    // BTC ticks at one decimal (szDecimals 5); five significant figures would
    // have rounded the real mid 63393.5 to 63,394.
    expect(formatPrice('63393.5', 5)).toBe('63,393.5');
    // SOL ticks at four (szDecimals 2) and uses all of them.
    expect(formatPrice('75.7565', 2)).toBe('75.7565');
    expect(formatPrice('1.6697', 2)).toBe('1.6697');
    // PUMP ticks at six (szDecimals 0).
    expect(formatPrice('0.002979', 0)).toBe('0.002979');
    expect(formatPrice('0.92505', 1)).toBe('0.92505');
  });

  it('treats the tick as a ceiling rather than a target', () => {
    // 294.0 at a four-decimal tick is still $294, not $294.0000.
    expect(formatPrice('294.0', 2)).toBe('294');
    expect(formatPrice('1886', 4)).toBe('1,886');
    expect(formatPrice('0', 2)).toBe('0');
    // A mid is the average of two ticks, so it may carry one decimal more.
    expect(formatPrice('63393.55', 5, true)).toBe('63,393.55');
    expect(formatPrice('63393.55', 5)).toBe('63,393.6');
  });

  it('leaves a price alone when no market says how it ticks', () => {
    expect(formatPrice('63393.5')).toBe('63,393.5');
    expect(formatPrice('0.0000305')).toBe('0.0000305');
  });

  it('shows nothing rather than zero for an absent price', () => {
    expect(formatPrice(null)).toBe('--');
    expect(formatPrice(undefined)).toBe('--');
  });

  it('reports the decimals the chart axis should use', () => {
    expect(priceDecimals('1886.9', 4)).toBe(1);
    expect(priceDecimals('63712', 5)).toBe(0);
    expect(priceDecimals('76.252', 2)).toBe(3);
    // Capped by the market tick when the value carries more.
    expect(priceDecimals('76.2525551', 2)).toBe(4);
  });

  it('shows balances to two decimals, bare when whole', () => {
    expect(formatUsd(100)).toBe('$100');
    expect(formatUsd(13.4)).toBe('$13.40');
    expect(formatUsd(1250.5)).toBe('$1,250.50');
    expect(formatUsd(-20)).toBe('-$20');
  });

  it('never renders a non-zero amount as zero', () => {
    expect(formatUsd(0.004)).toBe('$<0.01');
    expect(formatUsd('0.0000001')).toBe('$<0.01');
    expect(formatUsd(-0.004)).toBe('-$<0.01');
    // An actual zero is a zero, and a missing value is neither.
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(null)).toBe(MISSING_DISPLAY);
  });

  it('rounds a spendable balance down, never up', () => {
    // Rounding up would offer more than the wallet holds.
    expect(formatBalance('10.999')).toBe('10.99');
    expect(formatBalance('1234.5678')).toBe('1,234.56');
    expect(formatBalance('100')).toBe('100.00');
    expect(formatBalance('0.004')).toBe('<0.01');
    expect(formatBalance('0')).toBe('0.00');
    expect(formatBalance(null)).toBe(MISSING_DISPLAY);
  });

  it('withholds the plus sign from a change that rounds to zero', () => {
    expect(formatSignedPercent(0.34)).toBe('+0.34%');
    expect(formatSignedPercent(0.001)).toBe('0.00%');
    expect(formatSignedPercent(0)).toBe('0.00%');
    expect(formatSignedPercent(-1.2)).toBe('-1.20%');
  });

  it('compacts volume in one style across every band', () => {
    expect(formatCompactUsd('1490000000')).toBe('$1.49B');
    expect(formatCompactUsd('1700000000')).toBe('$1.7B');
    expect(formatCompactUsd('650800000')).toBe('$650.8M');
    // Thousands carry decimals like every other band, so $90.5K and $1.7B do
    // not look like they were measured to different precisions.
    expect(formatCompactUsd('123456')).toBe('$123.46K');
    expect(formatCompactUsd('90500')).toBe('$90.5K');
    expect(formatCompactUsd('474.810476')).toBe('$474.81');
    expect(formatCompactUsd('0')).toBe('$0');
    expect(formatCompactUsd(null)).toBe('--');
  });

  it('sizes positions at the market lot precision', () => {
    expect(formatSize(1.23456, 4)).toBe('1.2346');
    expect(formatSize(0.01, 4)).toBe('0.01');
    expect(formatSize(3, 4)).toBe('3');
    // szDecimals of 0 leaves no decimal point for the zero-stripping to eat.
    expect(formatSize(10, 0)).toBe('10');
    expect(formatSize(0, 4)).toBe('0');
  });

  it('formats string sizes without a Number precision loss', () => {
    expect(formatSize('9007199254740993.1234', 4)).toBe(
      '9007199254740993.1234'
    );
    expect(formatSize('9007199254740993', 0)).toBe('9007199254740993');
  });

  it('sizes by magnitude when the market is unknown', () => {
    expect(formatSize(1.5)).toBe('1.5');
    expect(formatSize(0.005)).toBe('0.005');
    expect(formatSize(0.25)).toBe('0.25');
  });

  it('formats fill time as M/D HH:mm using local time', () => {
    const time = new Date(2026, 0, 2, 3, 4).getTime();

    expect(formatFillTime(time)).toBe('1/2 03:04');
  });

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
  });
  describe('formatFundingPercent', () => {
    it('quotes four decimals, which is the floor for a millionths rate', () => {
      expect(formatFundingPercent('0.000013')).toBe('0.0013%');
      expect(formatFundingPercent('-0.000013')).toBe('-0.0013%');
      expect(formatFundingPercent('0')).toBe('0.0000%');
    });

    it('never flattens a rate that exists into a rate that does not', () => {
      // A market charging 0.00003% is a different fact from one charging
      // nothing, and "0.0000%" tells the user the second.
      expect(formatFundingPercent('0.0000003')).toBe('<0.0001%');
      expect(formatFundingPercent('-0.0000003')).toBe('-<0.0001%');
    });

    it('reads an absent rate as absent', () => {
      expect(formatFundingPercent(null)).toBe(MISSING_DISPLAY);
      expect(formatFundingPercent('')).toBe(MISSING_DISPLAY);
    });
  });

  describe('formatSignedPrice', () => {
    it('carries the sign and the market\'s own precision', () => {
      expect(formatSignedPrice('24.25', 4)).toBe('+24.25');
      expect(formatSignedPrice('-24.25', 4)).toBe('-24.25');
      // szDecimals 2 ticks at four decimals, and trailing zeros still go.
      expect(formatSignedPrice('-0.0042', 2)).toBe('-0.0042');
    });

    it('reads an absent change as absent, not as no change', () => {
      expect(formatSignedPrice(null, 4)).toBe(MISSING_DISPLAY);
    });
  });

  describe('chartPriceDecimals', () => {
    it('follows the market tick, not the current price', () => {
      // BTC (szDecimals 5) ticks at one decimal, PUMP (0) at six.
      expect(chartPriceDecimals(5)).toBe(1);
      expect(chartPriceDecimals(2)).toBe(4);
      expect(chartPriceDecimals(0)).toBe(6);
    });

    it('never returns a negative precision', () => {
      expect(chartPriceDecimals(8)).toBe(0);
    });

    it('reads most perps sensibly without a market to consult', () => {
      expect(chartPriceDecimals(undefined)).toBe(4);
    });
  });

  describe('mergeCandles', () => {
    const at = (t: number, close = '100') =>
      ethCandle({ t, T: t + 59_999, c: close });

    it('fills the bars a dropped feed missed', () => {
      const onScreen = [at(1000), at(61_000)];
      const snapshot = [at(61_000, '111'), at(121_000), at(181_000)];

      expect(mergeCandles(onScreen, snapshot).map((item) => item.t)).toEqual([
        1000, 61_000, 121_000, 181_000,
      ]);
    });

    it('believes the snapshot where both carry the same bar', () => {
      // A bar's closing print is not the last value that streamed while it was
      // still open, so the later reading of it wins.
      const merged = mergeCandles([at(61_000, '100')], [at(61_000, '111')]);

      expect(merged.length).toBe(1);
      expect(merged[0].c).toBe('111');
    });

    it('keeps history the snapshot no longer reaches back to', () => {
      const paged = [at(1000), at(61_000)];

      // The first bar is the dataset's identity to the chart: losing it
      // redraws the series and throws away the zoom the user chose.
      expect(mergeCandles(paged, [at(121_000)])[0].t).toBe(1000);
    });

    it('answers with the snapshot when there is nothing on screen', () => {
      expect(mergeCandles([], [at(1000)]).map((item) => item.t)).toEqual([1000]);
    });

    it('leaves the dataset untouched when the snapshot is empty', () => {
      const onScreen = [at(1000)];

      expect(mergeCandles(onScreen, [])).toBe(onScreen);
    });
  });

});

function ethPosition(
  overrides: Partial<PerpsPosition> = {}
): PerpsPosition {
  return {
    key: 'hl:ETH',
    dex: '',
    coin: 'ETH',
    symbol: 'ETH',
    sziExact: '-0.01',
    entryPxExact: '1921.5',
    positionValueExact: '18.895',
    unrealizedPnlExact: '0.34',
    returnOnEquityExact: '0.035',
    liquidationPxExact: '99829',
    leverage: 2,
    leverageType: 'cross',
    marginUsedExact: '9.44',
    isLong: false,
    ...overrides,
  };
}
