import {
  availableToTradeForSide,
  coinLogo,
  collateralToNotional,
  estimateMarketSlippagePercent,
  formatCompactUsd,
  formatFeeRatePercent,
  formatFillTime,
  formatPrice,
  formatSignedPercent,
  formatSize,
  formatUsd,
  maxOrderNotionalForSide,
  notionalAtLotSize,
  previewClosePosition,
  previewOrder,
  priceDecimals,
  sizeAtLot,
} from './perps.util';
import { PerpsMarket, PerpsPosition } from '@popup/_lib/perps';

describe('perps utilities', () => {
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

  it('estimates market slippage from the weighted book fill', () => {
    const book = {
      coin: 'ETH',
      time: 1,
      bids: [
        { price: 99, size: 4 },
        { price: 98, size: 10 },
      ],
      asks: [
        { price: 101, size: 2 },
        { price: 102, size: 10 },
      ],
    };

    expect(estimateMarketSlippagePercent(book, 4, true)).toBeCloseTo(1.5, 8);
    expect(estimateMarketSlippagePercent(book, 6, false)).toBeCloseTo(
      1.3333333333,
      8
    );
  });

  it('does not estimate slippage beyond the visible book depth', () => {
    const book = {
      coin: 'ETH',
      time: 1,
      bids: [{ price: 99, size: 1 }],
      asks: [{ price: 101, size: 1 }],
    };

    expect(estimateMarketSlippagePercent(book, 2, true)).toBeNull();
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

function ethMarket(overrides: Partial<PerpsMarket> = {}): PerpsMarket {
  return {
    key: 'hl:ETH',
    assetId: 0,
    dex: '',
    dexAssetIndex: 0,
    coin: 'ETH',
    symbol: 'ETH',
    szDecimals: 4,
    maxLeverage: 25,
    onlyIsolated: false,
    markPxExact: '100',
    midPxExact: '100',
    oraclePxExact: '100',
    prevDayPxExact: '95',
    changePercentExact: '0',
    dayVolumeExact: '0',
    openInterestSizeExact: '0',
    openInterestExact: '0',
    fundingExact: '0',
    ...overrides,
  };
}
