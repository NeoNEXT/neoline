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
  formatSize,
  formatUsd,
  formatBalance,
  isNegativeExact,
  MISSING_DISPLAY,
  priceDecimals,
} from './perps.util';

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
    // `--` 是「没有数字」，不是一个恰好在下跌的数字。
    expect(isNegativeExact(null)).toBeFalse();
    expect(isNegativeExact(undefined)).toBeFalse();
    expect(isNegativeExact('')).toBeFalse();
    expect(isNegativeExact('not a number')).toBeFalse();
  });
});

describe('perps utilities', () => {
  // 金额输入框每次按键都会跑这个函数，因此一个转账表达不了的数字，
  // 从一开始就到不了模型。
  it('cuts amount text to the decimals a transfer can carry', () => {
    expect(clampDecimals('5.0000001', 6)).toBe('5.000000');
    expect(clampDecimals('12.3456789012', 8)).toBe('12.34567890');
    expect(clampDecimals('1.23', 6)).toBe('1.23');
    // 单独一个小数点必须能留下来，否则它根本没法被输入。
    expect(clampDecimals('1.', 6)).toBe('1.');
    // 一切不属于金额的东西：货币符号、正负号、第二个小数点。
    expect(clampDecimals('$12.5', 6)).toBe('12.5');
    expect(clampDecimals('-1.5', 6)).toBe('1.5');
    expect(clampDecimals('1.2.3', 6)).toBe('1.2');
    expect(clampDecimals('abc', 6)).toBe('');
    expect(clampDecimals('', 6)).toBe('');
    // 只能整数计量的代币，压根不接受小数点。
    expect(clampDecimals('1.5', 0)).toBe('1');
  });

  // Hyperliquid 上架了 232 个永续，而内置图标只有寥寥几个，所以 CDN 才是常规路径，
  // 内置映射是例外，而不是反过来。
  it('resolves a coin mark, preferring the bundled asset', () => {
    expect(coinLogo('ETH')).toBe('assets/images/token/eth.webp');
    expect(coinLogo('BTC')).toBe('https://app.hyperliquid.xyz/coins/BTC.svg');
    expect(coinLogo('')).toBe('');
    expect(coinLogo(undefined)).toBe('');
  });

  // Neo 这一对是在接通 CDN 之前内置的；它们在 CDN 上的画法和其他所有行一样，
  // 所以本地副本不再替它们出场。
  it('takes the Neo markets from the CDN like any other coin', () => {
    expect(coinLogo('NEO')).toBe('https://app.hyperliquid.xyz/coins/NEO.svg');
    expect(coinLogo('GAS')).toBe('https://app.hyperliquid.xyz/coins/GAS.svg');
  });

  // CDN 的路径片段区分大小写：`btc.svg` 不是 `BTC.svg`。
  it('asks the CDN in the casing it answers to', () => {
    expect(coinLogo('btc')).toBe('https://app.hyperliquid.xyz/coins/BTC.svg');
  });

  // HIP-3 的图标归档在完整的协议币种名下。裸符号取到的是应用的 HTML 外壳，
  // 而把小写的 DEX 名改成大写同样会未命中。
  it('keeps the dex prefix, untouched, for a HIP-3 market', () => {
    expect(coinLogo('xyz:SNDK')).toBe(
      'https://app.hyperliquid.xyz/coins/xyz%3ASNDK.svg'
    );
    // HIP-3 dex 上的天然气保留它自己的图标，而不是 Neo GAS 的。
    expect(coinLogo('flx:GAS')).toBe(
      'https://app.hyperliquid.xyz/coins/flx%3AGAS.svg'
    );
    expect(coinLogo('GAS')).toBe('https://app.hyperliquid.xyz/coins/GAS.svg');
  });

  // `k` 是表示 1000 倍合约面值的前缀，不属于资产本身：kPEPE 以 1000 个 PEPE 为一手报价，
  // CDN 把它的图标归档在 PEPE 名下。
  it('drops the k multiplier prefix before asking for a mark', () => {
    expect(coinLogo('kPEPE')).toBe('https://app.hyperliquid.xyz/coins/PEPE.svg');
    expect(coinLogo('kBONK')).toBe('https://app.hyperliquid.xyz/coins/BONK.svg');
    // 这不是倍数前缀：真实符号通篇都是大写。
    expect(coinLogo('KAITO')).toBe('https://app.hyperliquid.xyz/coins/KAITO.svg');
  });

  it('formats dynamic fee rates without floating-point noise', () => {
    expect(formatFeeRatePercent(0.00045)).toBe('0.045%');
    expect(formatFeeRatePercent(0.000405)).toBe('0.0405%');
    expect(formatFeeRatePercent(0)).toBe('0%');
  });

  // 下面的期望值是测试网上的真实数值，配上它们真实的 `szDecimals`。用户会把这个界面和
  // Hyperliquid 自己的并排看，一个价格这边显示 63,394、那边显示 63,393.5，看起来就是数据打架。
  it('prices at the market tick, not at a magnitude band', () => {
    // BTC 的最小变动价位是一位小数（szDecimals 为 5）；
    // 若按五位有效数字，真实中间价 63393.5 会被舍成 63,394。
    expect(formatPrice('63393.5', 5)).toBe('63,393.5');
    // SOL 是四位（szDecimals 为 2），而且四位全都用上了。
    expect(formatPrice('75.7565', 2)).toBe('75.7565');
    expect(formatPrice('1.6697', 2)).toBe('1.6697');
    // PUMP 是六位（szDecimals 为 0）。
    expect(formatPrice('0.002979', 0)).toBe('0.002979');
    expect(formatPrice('0.92505', 1)).toBe('0.92505');
  });

  it('treats the tick as a ceiling rather than a target', () => {
    // 在四位小数的最小变动价位下，294.0 仍然是 $294，而不是 $294.0000。
    expect(formatPrice('294.0', 2)).toBe('294');
    expect(formatPrice('1886', 4)).toBe('1,886');
    expect(formatPrice('0', 2)).toBe('0');
    // 中间价是两个最小变动价位的平均值，所以它可能多带一位小数。
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
    // 数值带的小数更多时，由市场的最小变动价位来封顶。
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
    // 真正的零就是零，而缺失的值两者都不是。
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(null)).toBe(MISSING_DISPLAY);
  });

  it('rounds a spendable balance down, never up', () => {
    // 向上取整会给出多于钱包实际持有的金额。
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
    // 千位档和其他所有档一样带小数，这样 $90.5K 和 $1.7B 不会看起来像是
    // 用不同精度量出来的。
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
    // szDecimals 为 0 时根本没有小数点可供去零逻辑吃掉。
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
      // 一个收 0.00003% 的市场，和一个什么都不收的市场是不同的事实，
      // 而 "0.0000%" 告诉用户的是后者。
      expect(formatFundingPercent('0.0000003')).toBe('<0.0001%');
      expect(formatFundingPercent('-0.0000003')).toBe('-<0.0001%');
    });

    it('reads an absent rate as absent', () => {
      expect(formatFundingPercent(null)).toBe(MISSING_DISPLAY);
      expect(formatFundingPercent('')).toBe(MISSING_DISPLAY);
    });
  });

  describe('chartPriceDecimals', () => {
    it('follows the market tick, not the current price', () => {
      // BTC（szDecimals 为 5）的最小变动价位是一位小数，PUMP（为 0）是六位。
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

});
