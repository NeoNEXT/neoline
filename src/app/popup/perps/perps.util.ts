import {
  PERPS_PRICE_MAX_DECIMALS,
  PerpsMarket,
} from '@popup/_lib/perps';
import BigNumber from 'bignumber.js';

/**
 * 格式化函数接受什么：一个协议精度的十进制字符串，或者它的缺失。格式化函数就是渲染边界
 * —— 十进制字符串唯一可以变成 JavaScript 数字的地方，而且只为直接变成文本。
 */
export type PerpsExactValue = BigNumber.Value | null | undefined;

/** 在数值确实缺失的地方显示它，这样它永远不会被读成零。 */
export const MISSING_DISPLAY = '--';

/**
 * 按市场主键定位，而不是按符号：同一个符号可能同时存在于标准永续 DEX 和某个 HIP-3 DEX
 * 上，且精度不同。
 */
export function findMarketByKey(
  markets: PerpsMarket[],
  key: string
): PerpsMarket {
  return (markets || []).find((market) => market.key === key);
}

/**
 * 协议小数的正负判断 —— 模板里用 `< 0` 做不到这件事。
 *
 * 缺失的值没有正负：`--` 不会被涂成红色。
 */
export function isNegativeExact(value: PerpsExactValue): boolean {
  return !isMissing(value) && new BigNumber(value).isLessThan(0);
}

function isMissing(value: PerpsExactValue): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  return !new BigNumber(value).isFinite();
}

/**
 * 图标随钱包一起打包的币种，因此渲染时不必绕一趟网络。NEO 和 GAS 刻意不在其中：
 * Hyperliquid 两者都有，绘制风格与其他所有行一致，反倒是内置的这两个显得格格不入。
 * 只有当 CDN 上的图标不对或者根本没有时，才在这里保留一个条目。
 */
const LOCAL_COIN_LOGOS = {
  ETH: 'assets/images/token/eth.webp',
  BNB: 'assets/images/token/bnb.webp',
  AVAX: 'assets/images/token/avax.webp',
  MATIC: 'assets/images/token/matic.webp',
  USDC: 'assets/images/token/usdc.webp',
};

const FALLBACK_COLORS = [
  '#f7931a',
  '#627eea',
  '#14f195',
  '#f3ba2f',
  '#e6007a',
  '#2775ca',
  '#8247e5',
  '#ff5c5c',
];

/**
 * Hyperliquid 自己的币种图标，覆盖标准永续 DEX 上架的品种。
 *
 * 这里未命中不会是 `404`：未知币种会以 `200` 返回 Hyperliquid 应用的 HTML 外壳，所以唯一
 * 可观测的未命中，就是图片解码失败。调用方必须依赖图片的 `error` 事件降级，绝不能查状态码。
 */
const REMOTE_COIN_LOGO_PREFIX = 'https://app.hyperliquid.xyz/coins/';

/**
 * 图标在 CDN 上的名字，其路径片段区分大小写。
 *
 * 开头的 `k` 是 Hyperliquid 表示 1000 倍合约面值的前缀，不属于资产本身：`kPEPE` 以 1000
 * 个 PEPE 为一手报价，用的是 PEPE 的图标。真实符号都是大写，所以前面的小写 `k` 不会有歧义。
 */
function coinMarkName(coin: string): string {
  return /^k[A-Z0-9]/.test(coin) ? coin.slice(1) : coin.toUpperCase();
}

/**
 * 市场的图标：先用内置资源，再用 Hyperliquid 的 CDN。
 *
 * 按协议 `coin` 建索引，而不是展示符号 —— HIP-3 市场的图标存放在它完整的 `dex:SYMBOL`
 * 名字下（`xyz:SNDK.svg`），裸符号什么都取不到。前缀是路径的一部分，原样透传：DEX 名是
 * 小写而符号是大写，任何一半改动大小写都会未命中。这同时也让 `flx:GAS`（天然气）离内置
 * 的 GAS 图标远远的 —— 那是一个恰好共用符号的不同资产。
 *
 * 只有币种缺失时才返回 `''`。CDN 上没有的币种照样返回一个 URL，等那张图加载失败时再解析
 * 成字母色块。
 */
export function coinLogo(coin: string): string {
  if (!coin) {
    return '';
  }
  if (coin.includes(':')) {
    return `${REMOTE_COIN_LOGO_PREFIX}${encodeURIComponent(coin)}.svg`;
  }
  const local = LOCAL_COIN_LOGOS[coin.toUpperCase()];
  if (local) {
    return local;
  }
  const name = encodeURIComponent(coinMarkName(coin));
  return `${REMOTE_COIN_LOGO_PREFIX}${name}.svg`;
}

/** 按币种取稳定的颜色，好让一个市场在多次渲染之间保持同一个色块。 */
export function coinColor(coin: string): string {
  let hash = 0;
  for (let i = 0; i < (coin || '').length; i++) {
    hash = (hash * 31 + coin.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/**
 * 成交量和未平仓量，按数量级分档显示：1_490_000_000 -> "$1.49B"。
 *
 * 每一档都保留同样的两位小数并去掉尾随零，这样读作 "$1.7B" 的一行和读作 "$90.5K" 的一行
 * 并排放着，也不会让人觉得两者的量度方式不同。
 */
export function formatCompactUsd(value: PerpsExactValue): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const amount = new BigNumber(value);
  const abs = amount.absoluteValue();
  const sign = amount.isNegative() ? '-' : '';
  const band = COMPACT_BANDS.find((item) =>
    abs.isGreaterThanOrEqualTo(item.threshold)
  );
  const scaled = band ? abs.dividedBy(band.threshold) : abs;
  return `${sign}$${stripTrailingZeros(scaled.toFixed(2))}${
    band ? band.suffix : ''
  }`;
}

const COMPACT_BANDS = [
  { threshold: new BigNumber('1e12'), suffix: 'T' },
  { threshold: new BigNumber('1e9'), suffix: 'B' },
  { threshold: new BigNumber('1e6'), suffix: 'M' },
  { threshold: new BigNumber('1e3'), suffix: 'K' },
];

/**
 * 去掉定点小数渲染补上的、而数字本身并没有的尾随零。
 *
 * 预留的位数说的是刻度的能力，而不是对这个数值的陈述：一个能报四位小数的市场，
 * $4 照样显示成 "4"。
 */
export function stripTrailingZeros(text: string): string {
  return text.includes('.')
    ? text.replace(/\.?0+$/, '')
    : text;
}

/**
 * 一个市场实际能报出的小数位数。
 *
 * Hyperliquid 的永续价格以 `6 - szDecimals` 位小数为最小变动价位，所以决定「值得显示多少
 * 精度」的是它，而不是一张按数量级分档的表：BTC（`szDecimals` 为 5）报一位小数，
 * PUMP（`szDecimals` 为 0）报六位。中间价是两个最小变动价位的平均值，因此可能比一个最小
 * 变动价位多带一位小数。
 *
 * 没有市场可查时，值原样保留交易场所发来的样子：它本来就已经按最小变动价位量化过，
 * 在这里凭空造一个上限，会把交易场所认为真实的一位数字给舍掉。
 */
export function priceDecimals(
  price: PerpsExactValue,
  szDecimals?: number,
  isMid = false
): number {
  const fraction = (isMissing(price) ? '0' : new BigNumber(price).toFixed())
    .split('.')[1];
  const actual = fraction ? fraction.length : 0;
  if (szDecimals === undefined) {
    return actual;
  }
  // 最小变动价位是上限而不是目标：把 $294 补成 "294.0000" 是在宣称一个这个价格并不具备
  // 的精度；而一个不知怎么超出了最小变动价位的值，才是这个上限必须发挥作用的唯一情形。
  const cap =
    Math.max(0, PERPS_PRICE_MAX_DECIMALS - szDecimals) + (isMid ? 1 : 0);
  return Math.min(actual, cap);
}

/**
 * 图表价格坐标轴报出的小数位数。
 *
 * 坐标轴必须能渲染这个市场可能印出的每一个价格，所以它只跟随市场的最小变动价位 ——
 * 绝不跟随当前价格恰好带了几位小数。一个正好落在 `1.68` 上的中间价只有两位，若坐标轴照
 * 抄，会把 1.6800 到 1.6900 之间的每一根 K 线都压到同一个标签上。没有市场可查时，四位
 * 小数对大多数永续合约来说最合适。
 */
export function chartPriceDecimals(szDecimals?: number): number {
  return szDecimals === undefined
    ? 4
    : Math.max(0, PERPS_PRICE_MAX_DECIMALS - szDecimals);
}

/**
 * 不带货币符号的价格 —— `$` 由模板补上。
 *
 * 直接从协议小数格式化，而不是先转成浮点数；也绝不按有效数字位数截断：BTC 在 `63393.5`
 * 时这里读作 "63,393.5"，与 Hyperliquid 上一模一样，而按五位有效数字舍入会显示成
 * "63,394"，悄悄与交易场所不一致。
 */
export function formatPrice(
  price: PerpsExactValue,
  szDecimals?: number,
  isMid = false
): string {
  if (isMissing(price)) {
    return MISSING_DISPLAY;
  }
  const decimals = priceDecimals(price, szDecimals, isMid);
  const value = new BigNumber(price).decimalPlaces(
    decimals,
    BigNumber.ROUND_HALF_UP
  );
  const [whole, fraction] = value.absoluteValue().toFixed(decimals).split('.');
  const grouped = Number(whole).toLocaleString('en-US');
  const sign = value.isNegative() ? '-' : '';
  return `${sign}${stripTrailingZeros(
    fraction ? `${grouped}.${fraction}` : grouped
  )}`;
}

/**
 * 属于余额而非价格的金额：两位小数，但整数金额去掉 `.00` —— 这样 $13.40 保持原样，
 * $100 显示成 $100 而不是 $100.00。
 *
 * 小到挺不过舍入的金额读作 `<$0.01` 而不是 `$0`：一笔存在的手续费或残余，和一笔不存在的
 * 不是同一个事实，而被告知 `$0` 的用户，被告知的是一件不真实的事。
 */
export function formatUsd(value: PerpsExactValue, decimals = 2): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const amount = new BigNumber(value);
  const sign = amount.isNegative() ? '-' : '';
  const abs = amount.absoluteValue();
  const smallest = new BigNumber(1).shiftedBy(-decimals);
  if (abs.isGreaterThan(0) && abs.isLessThan(smallest)) {
    return `${sign}$<${smallest.toFixed(decimals)}`;
  }
  const formatted = abs.toNumber().toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}$${formatted.replace(/\.00$/, '')}`;
}

/**
 * 可动用的余额，向下取整，且不带货币符号。
 *
 * 按常规方式舍入余额，可能显示出并不存在的钱：10.999 渲染成 "11.00" 会诱使用户填一个转账
 * 会拒绝的金额。货币符号 `$` 或代币符号由调用方补上，因为同一个数字两处都要用。零头仍然
 * 读作 `<0.01` 而不是 `0.00` —— 一个存在、只是在这个精度下表达不出来的余额，不是零余额。
 */
export function formatBalance(value: PerpsExactValue, decimals = 2): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const amount = new BigNumber(value);
  const sign = amount.isNegative() ? '-' : '';
  const abs = amount.absoluteValue();
  const smallest = new BigNumber(1).shiftedBy(-decimals);
  if (abs.isGreaterThan(0) && abs.isLessThan(smallest)) {
    return `${sign}<${smallest.toFixed(decimals)}`;
  }
  const floored = abs.decimalPlaces(decimals, BigNumber.ROUND_FLOOR);
  const [whole, fraction] = floored.toFixed(decimals).split('.');
  const grouped = Number(whole).toLocaleString('en-US');
  return `${sign}${fraction ? `${grouped}.${fraction}` : grouped}`;
}

/** 带符号的金额，例如 "+$21.75" —— 用于正负号本身有含义的盈亏。 */
export function formatSignedUsd(value: PerpsExactValue, decimals = 2): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const n = new BigNumber(value).toNumber();
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * 带符号的涨跌，例如 "+0.34%"。小到挺不过舍入的波动读作平淡的 "0.00%"：一旦渲染出来的
 * 数字为零就不加正号，这样没有波动的市场不会声称自己在涨。
 */
export function formatSignedPercent(
  value: PerpsExactValue,
  decimals = 2
): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const n = new BigNumber(value).toNumber();
  const text = n.toFixed(decimals);
  return `${Number(text) > 0 ? '+' : ''}${text}%`;
}

/**
 * 仓位或订单数量。Hyperliquid 会把数量舍入到市场的最小变动单位精度，所以那才是值得显示
 * 的精度，并去掉尾随零。没有市场可查时由数量级决定，这样小数量保持可读，整数量也不会被
 * 补上一堆零。
 */
export function formatSize(
  size: BigNumber.Value,
  szDecimals?: number
): string {
  const value = new BigNumber(size || 0);
  if (!value.isFinite() || value.isZero()) {
    return '0';
  }
  const strip = (text: string) =>
    text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  if (szDecimals !== undefined) {
    return strip(value.toFixed(Math.max(0, szDecimals)));
  }
  const abs = value.absoluteValue();
  if (abs.isLessThan(0.01)) {
    return strip(value.toFixed(6));
  }
  if (abs.isLessThan(1)) {
    return strip(value.toFixed(4));
  }
  return strip(value.toFixed(2));
}

/**
 * 把金额文本裁到目标方能够承载的小数位数。
 *
 * 它在金额输入框的每一次按键上运行，因此一个转账表达不了的数字永远到不了模型：它在输入
 * 的当下就被丢掉，而不是先接受再解释 —— 与转账页面的金额输入框行为一致。最后一位可接受
 * 小数之后的内容会被去掉，开头的正负号或货币符号、以及第二个小数点也一并去掉。
 */
export function clampDecimals(value: string, decimals: number): string {
  const places = Math.max(0, Math.floor(decimals) || 0);
  const fraction = places > 0 ? `(?:\\.\\d{0,${places}})?` : '';
  return (value || '').replace(
    new RegExp(`^\\D*(\\d*${fraction}).*`),
    '$1'
  );
}

/**
 * 以百分比表示的每小时资金费率，例如 0.000013 -> "0.0013%"。
 *
 * 四位小数是下限而不是选择：资金费按百万分之几报价，而一个收 0.00003% 的市场，和一个
 * 什么都不收的市场不是同一个事实。小到够不着第四位小数的费率读作 `<0.0001%`，并保留它的
 * 正负号，而不是被压平成 `0.0000%`。
 */
export function formatFundingPercent(value: PerpsExactValue): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const percent = new BigNumber(value).times(100);
  const abs = percent.absoluteValue();
  const floor = new BigNumber(1).shiftedBy(-FUNDING_PERCENT_DECIMALS);
  if (abs.isGreaterThan(0) && abs.isLessThan(floor)) {
    return `${percent.isNegative() ? '-' : ''}<${floor.toFixed(
      FUNDING_PERCENT_DECIMALS
    )}%`;
  }
  return `${percent.toFixed(FUNDING_PERCENT_DECIMALS)}%`;
}

/** 资金费按百万分之几报价，所以百分比需要四位小数。 */
const FUNDING_PERCENT_DECIMALS = 4;

/** 把小数形式的费率格式化用于显示，例如 0.000405 -> "0.0405%"。 */
export function formatFeeRatePercent(value: PerpsExactValue): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  const percent = new BigNumber(value).times(100).toNumber();
  return `${percent.toFixed(6).replace(/\.?0+$/, '')}%`;
}

/**
 * 仓位数量在屏幕上不带方向 —— 多空由它旁边的标签表达，一个负号只会把同一件事说两遍。
 */
export function formatPositionSize(
  size: PerpsExactValue,
  szDecimals?: number
): string {
  return formatSize(new BigNumber(size || 0).absoluteValue(), szDecimals);
}

/** 权益回报率以小数形式到达；标签上显示成百分比。 */
export function formatReturnOnEquity(
  value: PerpsExactValue,
  decimals = 2
): string {
  if (isMissing(value)) {
    return MISSING_DISPLAY;
  }
  return formatSignedPercent(new BigNumber(value).times(100), decimals);
}

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** 为紧凑的历史记录行格式化成交时间戳：M/D HH:mm。 */
export function formatFillTime(time: number): string {
  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
}
