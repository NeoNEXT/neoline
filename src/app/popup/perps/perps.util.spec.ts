import {
  chartPriceDecimals,
  clampDecimals,
  coinLogo,
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
  isNegativeExact,
  MISSING_DISPLAY,
  mergeCandles,
  priceDecimals,
} from './perps.util';
import { ethCandle } from './perps.test-fixture';

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
