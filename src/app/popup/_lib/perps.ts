/**
 * 由 Hyperliquid 提供的永续合约。
 * 文档：https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */

import BigNumber from 'bignumber.js';

import { environment } from '@/environments/environment';

export type PerpsNetwork = 'mainnet' | 'testnet';

/**
 * 本版本连的是 `HYPERLIQUID_API` 的哪一半。
 *
 * 测试网只是开发用的便利，所以无论环境文件怎么配，生产构建一律走主网。
 */
/**
 * 把 API 返回的值强制成一个有限的协议精度十进制字符串。
 *
 * 对任何可能回流进签名的东西，保持交易场所自己的十进制文本原样不动；对交易场所省略掉的
 * 字段，返回 '0' 而不是 NaN（ADR-0001）。
 */
export function perpsFiniteDecimal(value: any): string {
  const parsed = new BigNumber(value ?? 0);
  return parsed.isFinite() ? (parsed.isZero() ? '0' : parsed.toFixed()) : '0';
}

export function resolvePerpsTestnet(
  configuredNetwork: PerpsNetwork,
  production = environment.production
): boolean {
  return !production && configuredNetwork === 'testnet';
}

export const HYPERLIQUID_API = {
  mainnet: {
    info: 'https://api.hyperliquid.xyz/info',
    exchange: 'https://api.hyperliquid.xyz/exchange',
    ws: 'wss://api.hyperliquid.xyz/ws',
  },
  testnet: {
    info: 'https://api.hyperliquid-testnet.xyz/info',
    exchange: 'https://api.hyperliquid-testnet.xyz/exchange',
    ws: 'wss://api.hyperliquid-testnet.xyz/ws',
  },
};

/**
 * NeoLine 在 Hyperliquid 标准永续 DEX 之外另行开放的 HIP-3 DEX。
 *
 * `perpDexs` 是一个没有上限的注册表（测试网上尤甚），把它当作市场列表，会把一次元数据请求
 * 扇出到每一个已部署的 DEX，耗尽 Hyperliquid 按 IP 共享的限流额度。所以产品支持哪些 DEX
 * 要显式写明。
 */
export const PERPS_HIP3_DEXES: {
  mainnet: string[];
  testnet: string[];
} = {
  mainnet: ['xyz'],
  testnet: ['xyz'],
};

/** 与收藏一起置顶在已排序市场列表上方的市场。 */
export const PERPS_NEO_COINS = ['NEO', 'GAS'];

/**
 * perps 子页面返回到哪里。Perps 是首页的一个 tab 而不是它自己的路由，所以这个参数是唯一能
 * 告诉首页「重新打开它」而不是把用户丢回资产页的东西。
 */
export const PERPS_HOME_URL = '/popup/home?tab=perps';

export interface PerpsDepositConfig {
  chainId: number;
  /**
   * 入金链的端点，按顺序依次尝试。
   *
   * 与钱包网络上的 RPC 列表不同，这些端点从来不是用户选的：入金链只是资金通道的实现细节，
   * 因此从一个失效端点轮换走并不等于替换掉用户挑选的节点。每个条目都必须服务于同一个链 id，
   * 使用前会做校验。
   */
  rpcUrls: string[];
  chainName: string;
  symbol: string;
  /** 链自身的货币 —— 网络手续费实际是用它付的。 */
  nativeSymbol: string;
  decimals: number;
  /** USDC 以何种方式从这条链前往 HyperCore。 */
  cctp: PerpsCctpSourceConfig;
}

/**
 * 一条入金链的 CCTP 侧。
 *
 * 在迁移过程中把它单列成一块，是因为已退役的那条通道对「入账的是哪个代币」有不同说法 ——
 * 测试网上 Bridge2 收的是一个 mock 的 USDC2，而 CCTP 销毁的是 Circle 自己的 USDC —— 把其中
 * 一个发到另一个那里是不可挽回的。现在已经没有代码读旧字段了，但这个分组仍然说明这些地址
 * 属于哪个协议。
 */
export interface PerpsCctpSourceConfig {
  /** Circle 的 `CctpExtension`：在同一笔源链交易里完成授权与销毁。 */
  extension: string;
  /** 原生的 Circle USDC —— 销毁唯一接受的代币。 */
  usdc: string;
  /** 这条链的 CCTP domain，不是它的 EVM 链 id。 */
  sourceDomain: number;
}

/**
 * Hyperliquid 的资金通道走的是 Arbitrum 上 Circle 的 CCTP：只销毁原生 Circle USDC，
 * 把跨桥来的 USDC.e 发到同样的合约是拿不回来的。
 */
export const PERPS_DEPOSIT_CONFIG: {
  mainnet: PerpsDepositConfig;
  testnet: PerpsDepositConfig;
} = {
  mainnet: {
    chainId: 42161,
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one-rpc.publicnode.com',
      'https://arbitrum.drpc.org',
    ],
    chainName: 'Arbitrum',
    symbol: 'USDC',
    nativeSymbol: 'ETH',
    decimals: 6,
    cctp: {
      extension: '0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE',
      usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      sourceDomain: 3,
    },
  },
  testnet: {
    chainId: 421614,
    rpcUrls: [
      'https://sepolia-rollup.arbitrum.io/rpc',
      'https://arbitrum-sepolia-rpc.publicnode.com',
    ],
    chainName: 'Arbitrum Sepolia',
    symbol: 'USDC',
    nativeSymbol: 'ETH',
    decimals: 6,
    cctp: {
      extension: '0x8E4e3d0E95C1bEC4F3eC7F69aa48473E0Ab6eB8D',
      usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      sourceDomain: 3,
    },
  },
};

/**
 * 资金相关的各种门槛，放在一起是因为它们是交易场所的规则而不是界面的选择 —— 把它们散落到
 * 各个页面，正是一份副本最终会和另一份对不上的原因。
 *
 * 来源已于 2026-08-18 对照一手资料核实。下面两个 Bridge2 的数字描述的是正在退役的那条通道；
 * 取代它们的 CCTP 通道是按次报价而不是公布一个常量，所以本文件里不该出现任何手续费常量。
 * 无论报价说多少，实际被扣走的金额都要从交易场所账本读回来 —— 报价是上限，不是回执。
 */

/**
 * 入金的产品下限，不是协议规则。
 *
 * 在 Bridge2 上，低于这个数的入金会被静默吞掉。CCTP 没有这种门槛 —— Circle 明确说明任意
 * 金额的入金都会入账 —— 所以这个下限仅仅作为「与 Hyperliquid 自家界面保持一致」的产品决策
 * 留了下来。文案绝不能声称更小的入金会丢失，因为在这条通道上并不会。协议自己的下限是手续费
 * 报价：低于它，目的链会 revert。
 */
export const PERPS_MIN_DEPOSIT = 5;
/** 低于这个名义价值，Hyperliquid 会拒绝普通订单和部分平仓订单。 */
export const PERPS_MIN_ORDER_NOTIONAL = 10;
/** 仅当用户选择 Max / 100% 时才施加的安全预留。 */
export const PERPS_MAX_ORDER_BUFFER_FRACTION = 0.005;

/** Hyperliquid 的永续价格最多六位小数，再减去 `szDecimals`。 */
export const PERPS_PRICE_MAX_DECIMALS = 6;
/** ……并且不超过五位有效数字，两者中先卡住的那个生效。 */
export const PERPS_PRICE_SIGNIFICANT_FIGURES = 5;

/**
 * Hyperliquid 对某个市场的价格接受多少位小数。
 *
 * 它的两条限制同时生效，更紧的那条胜出，因此答案既取决于市场也取决于价格：在一个四位小数
 * 的市场上，$0.5432 四位全留，而 $1234.5 只留一位。
 *
 * 上链价格就是按这条规则量化的，所以下单表单也把用户输入的限价按它规范化 —— 否则签名里
 * 携带的会是一个用户从未见过的价格。
 */
export function perpsPriceDecimals(
  price: number,
  szDecimals: number
): number {
  const maxDecimals = Math.max(0, PERPS_PRICE_MAX_DECIMALS - szDecimals);
  const magnitude = Math.abs(price);
    // 没有量级可供计算有效数字；此时只由最小变动价位说了算。
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return maxDecimals;
  }
  const significantDecimals = Math.max(
    0,
    PERPS_PRICE_SIGNIFICANT_FIGURES - Math.floor(Math.log10(magnitude)) - 1
  );
  return Math.min(maxDecimals, significantDecimals);
}
/**
 * HyperEVM，只读：为提现定价的那条链。
 *
 * 提现在这里永远不会变成一笔用户要签名的交易 —— 它是一次已签名的交易场所操作，HyperEVM
 * 之所以出现，只是因为决定转发费的那个合约住在它上面。钱包在这条链上只读那个合约，别的都不碰。
 */
export const PERPS_HYPEREVM_CONFIG = {
  mainnet: {
    chainId: 999,
    chainName: 'HyperEVM',
    /** 与之配对的入金链；把两者混起来会让资金搁浅。 */
    pairedDepositChainId: 42161,
    rpcUrls: [
      'https://rpc.hyperliquid.xyz/evm',
      'https://hyperliquid.drpc.org',
    ],
    /** 为提现定价并执行销毁；可暂停、可升级。 */
    coreDepositWallet: '0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24',
    /** 接收入金的 mint，并把它转发到 HyperCore 账户。 */
    cctpForwarder: '0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757',
  },
  testnet: {
    chainId: 998,
    chainName: 'HyperEVM Testnet',
    pairedDepositChainId: 421614,
    rpcUrls: ['https://rpc.hyperliquid-testnet.xyz/evm'],
    coreDepositWallet: '0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206',
    cctpForwarder: '0x02e39ECb8368b41bF68FF99ff351aC9864e5E2a2',
  },
};

/** HyperEVM 的 CCTP domain —— 两个方向的报价都以它为目的地。 */
export const PERPS_CCTP_HYPEREVM_DOMAIN = 19;

/**
 * Circle 为入金方向提供的手续费端点，按网络区分。
 *
 * 测试网的报价来自沙箱 Iris 主机。两个网络共用源 domain `3`，所以只用一个 URL 会在测试网上
 * 取到主网费率，然后把它们作为 `maxFee` 发到一次销毁上 —— 那份报价描述的将是另一条通道，
 * 而不是即将执行的这一条。
 *
 * `forward=true&hyperCoreDeposit=true` 才是让答复描述我们这条通道的关键：没有它们，同一个
 * 路径给出的是一次普通 HyperEVM 转账的价格，那是另一个数字，却会被当成我们的报给用户。
 */
export const PERPS_CCTP_FEE_API = {
  mainnet: 'https://iris-api.circle.com/v2/burn/USDC/fees',
  testnet: 'https://iris-api-sandbox.circle.com/v2/burn/USDC/fees',
};

/**
 * HyperCore 的「用户是否存在」预编译，用于判断 Circle 的开户费是否适用于某笔入金。它回答的
 * 是账户是否存在，而不是账户是否已激活 —— 那笔一次性的激活费是 Hyperliquid 的，在这里看不到。
 */
export const PERPS_CORE_USER_EXISTS_PRECOMPILE =
  '0x0000000000000000000000000000000000000810';

/**
 * 提现中 HyperCore 到 HyperEVM 那一段所携带的 gas 上限。
 *
 * Hyperliquid 的文档写明这次转移的成本是 200k gas，按下一个 HyperEVM 区块的基础 gas 价格计。
 * 它不是用户自己的交易 —— 提现不需要任何人签一笔 EVM 交易 —— 所以这是协议给的数字，而不是
 * 需要我们去估算的东西。
 */
export const PERPS_CORE_TO_EVM_GAS_LIMIT = 200000;

/**
 * 入金落在 HyperCore 的什么地方：0 是永续余额。
 *
 * 现货余额是 `0xFFFFFFFF`，而本产品从不往那里发 —— 入账到现货的钱在 NeoLine 内既不能交易
 * 也不能提出，所以往那里入金等于故意制造一笔搁浅的余额。
 */
export const PERPS_CCTP_DEX_PERPS = 0;

/**
 * 一份已签名的入金授权能保持可用多久。
 *
 * 它必须活得比确认对话框长，但也仅此而已：这份授权准许扩展合约恰好取走这个金额，所以它的
 * 有效窗口就是「签名一旦泄露仍然值钱」的那段时间。
 */
export const PERPS_DEPOSIT_AUTH_VALIDITY_SECONDS = 1800;

/** Fast Transfer。较慢的那档不提供，因此也不可配置。 */
export const PERPS_CCTP_FINALITY_FAST = 1000;

/**
 * 施加在 CCTP 入金 gas 估算值上的放大系数。
 *
 * Circle 自己的示例用的也是这 20%：「一次授权加一次外部调用」的估算余量很紧，而 gas 耗尽的
 * 入金照样会烧掉已经用掉的部分。确认页展示的网络手续费按这个带缓冲的上限计算，绝不用裸估算
 * 值 —— 展示给用户的数字必须是他们最多会被收取的那个。以十分之一为单位（12/10）施加，这样
 * 乘法全程不经过 Number：`1.15 * 100` 并不等于 115，而对那个残差取 `BigInt` 会抛 RangeError。
 */
export const PERPS_DEPOSIT_GAS_BUFFER = 1.2;

/**
 * 资金页面多久重新读取一次源链的代币余额。
 *
 * 永续账户是经 websocket 到达的，但钱包自己的余额在另一条没有这种数据源的链上，所以改用轮询。
 * 15 秒足够短，让在别处做的入金能在页面开着时显示出来；也足够长，不至于在用户输入时反复捶打
 * 一个公共 RPC。
 */
export const PERPS_WALLET_BALANCE_POLL_MS = 15000;

/**
 * 入金链公共端点的韧性策略。
 *
 * 这些数字沿用 MetaMask 自己的 `RpcService`：以指数退避重试四次后放弃某个端点。它的可重试
 * 集合在入金链服务里被复现：只重试临时性的传输故障，绝不重试业务错误，而且只要浏览器报告
 * 自己离线，就什么都不重试。
 */
export const PERPS_CHAIN_MAX_RETRIES = 4;
export const PERPS_CHAIN_RETRY_BASE_MS = 250;
export const PERPS_CHAIN_REQUEST_TIMEOUT_MS = 10000;
/**
 * 一笔入金的回执要守候多久，界面才不再等下去。
 *
 * 到时并不算失败：交易已经广播，之后仍可能确认，所以它会变成一笔待入账的入金而不是一个错误。
 */
export const PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS = 90000;

/** 一笔待入账的入金多久重查一次，以及要跟踪多久。 */
export const PERPS_PENDING_DEPOSIT_POLL_MS = 10000;
export const PERPS_PENDING_DEPOSIT_MAX_MS = 300000;

/**
 * 一笔已经广播、但资金尚不可用的跨桥入金。
 *
 * 会持久化，因为弹窗关闭绝不能把在途的钱跟丢。它只保存公开的交易参数 —— 绝不含私钥、密码，
 * 或任何可被重放的东西。
 */
export interface PerpsPendingDeposit {
  /** 这笔是在哪条入金链上发出的，这样切换网络也不会把它搞混。 */
  chainId: number;
  /** 发送地址，也是跨桥入账的那个地址。 */
  address: string;
  amountExact: string;
  hash: string;
  startedAt: number;
  /** 转账在入金链上已经拿到状态为成功的回执时为 true。 */
  chainConfirmed: boolean;
  /**
   * 已确知源链交易被 revert 时为 true。
   *
   * 这是一个有定论的结局，而不是一个缓慢的过程：USDC 从未被销毁，所以入账不会到来，这条记录
   * 必须停止显示成「仍在途中」。
   */
  reverted?: boolean;
  /**
   * 入金发出之前的可提余额，按账户模式规定的方式读取。当那个余额升到高于它时，入账就已落地
   * —— 这是交易场所给出的唯一一个「跨桥已完成」的信号。
   */
  withdrawableBeforeExact: string;
}

/**
 * NeoLine 的 builder 费用，由 Hyperliquid 在它自己的 taker/maker 费率之上收取，并付给下面
 * 那个 builder 地址。
 *
 * 上链字段 `f` 以十分之一个基点计。用户签署的授权被钉在恰好这个费率上，而不是钉在 Hyperliquid
 * 0.1% 的上限上：一份授权准许的是「直到它所写明的费率为止的一切」，所以授权得比实际收取的多，
 * 就等于留出了不必再问一次就能上调费用的空间。
 */
export const PERPS_BUILDER_FEE_TENTHS_BPS = 45;
export const PERPS_BUILDER_FEE_RATE = PERPS_BUILDER_FEE_TENTHS_BPS / 100000;
export const PERPS_BUILDER_MAX_FEE_RATE = '0.045%';

/**
 * 收取 builder 费用的地址，按网络区分。
 *
 * 留空会彻底关闭该费用 —— 订单上不带 `builder` 字段，也不弹授权提示 —— 这样未配置的构建会
 * 按 Hyperliquid 的裸费率交易，而不是把钱付给一个无关地址。此外 Hyperliquid 还要求 builder
 * 的永续账户价值至少有 100 USDC 才认这笔费用；低于此，它会拒绝每一笔带这个字段的订单。
 */
export const PERPS_BUILDER_ADDRESS: { mainnet: string; testnet: string } = {
  mainnet: '',
  testnet: '',
};

/**
 * 市价单的滑点容忍度，以百分比计。市价单其实是一张按盘口中间价穿透这么多的 IOC 限价单，所以
 * 这个取值范围由表单和构造订单的服务共用 —— 只在界面上设的上限会被悄悄钳掉，用户根本察觉不到。
 *
 * 0.1–10% 的范围刻意比 Hyperliquid 自家对话框更紧，后者最高接受 100.00 —— 在那个上限上，IOC
 * 限价会落在中间价的两倍（或零倍）处，等同于「盘口里有什么就用什么成交」。10% 已经远宽于任何
 * 有流动性的市场所需，所以这个上限对正常订单没有任何代价，却能在签名之前拦下一个手误输错的
 * 容忍度。
 */
export const PERPS_MIN_SLIPPAGE_PERCENT = 0.1;
export const PERPS_MAX_SLIPPAGE_PERCENT = 10;
export const PERPS_DEFAULT_SLIPPAGE_PERCENT = 3;

/**
 * 市场列表可以按什么排序。
 *
 * 这两个数字在每一行上都看得见。用户看不到依据的排序 —— 比如资金费率，它只在市场详情里 ——
 * 产生的是一个读起来毫无道理的顺序，所以这里不提供。
 */
export type PerpsMarketSortKey = 'volume' | 'change';

/** 每批实际渲染出来的行数；这个列表长到需要分批。 */
export const PERPS_MARKET_PAGE_SIZE = 30;

export const PERPS_CANDLE_INTERVALS = [
  '1m',
  '5m',
  '15m',
  '1h',
  '12h',
  '1d',
  '1w',
  '1M',
] as const;
export type PerpsCandleInterval = typeof PERPS_CANDLE_INTERVALS[number];

/**
 * 一个来自本版本之外的值，是否仍是本版本提供的周期。
 *
 * 存储返回的是旧版本写进去的任意值，而那未必还是一个仍然存在的周期。大小写在这里和别处一样
 * 要紧：`1M` 和 `1m` 是不同的周期，所以这是一次成员判断，而绝不是一次归一化。
 */
export function isCandleInterval(value: unknown): value is PerpsCandleInterval {
  return PERPS_CANDLE_INTERVALS.includes(value as PerpsCandleInterval);
}

/**
 * 这个周期的一根 K 线覆盖多长时间。
 *
 * 大小写在这里就是全部关键：`m` 是分钟，`M` 是月，而未知的单位绝不能悄悄退回到其中任何一个。
 * 月没有固定长度，所以三十天只用来确定请求窗口的大小，别无他用 —— 月线柱子从哪里开始、到
 * 哪里结束，仍由交易场所决定。
 *
 * 它和周期本身放在一起，而不是放在数据源上：它读一个协议值、返回一个时长，这对周期本身成立，
 * 而不属于任何一种传输方式。
 */
export function perpsIntervalMs(interval: PerpsCandleInterval): number {
  const unit = interval.slice(-1);
  const value = Number(interval.slice(0, -1));
  const table = {
    m: 60e3,
    h: 3600e3,
    d: 86400e3,
    w: 7 * 86400e3,
    M: 30 * 86400e3,
  };
  const unitMs = table[unit];
  if (!unitMs) {
    throw new Error(`Unsupported Hyperliquid candle interval: ${interval}`);
  }
  return value * unitMs;
}

/**
 * 每个周期在屏幕上怎么写。
 *
 * 显示值和协议值刻意是两个不同的字符串。Hyperliquid 的日线和周线是小写的 `1d` 和 `1w`，而
 * 月线是 `1M` —— 与分钟线 `1m` 只差一个大小写。屏幕上只出现这些标签，而比较、存储和发送只
 * 用协议值；两者之间任何一处不区分大小写的比较，都会把「月」悄无声息地变成「分钟」。
 */
export const PERPS_CANDLE_INTERVAL_LABELS: Record<
  PerpsCandleInterval,
  string
> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '12h': '12h',
  '1d': '1D',
  '1w': '1W',
  '1M': '1M',
};

/**
 * 一次快照包含多少根 K 线。
 *
 * 这个大小是为了向前翻看而定的，不是为了初始视图 —— 初始视图大约显示三十根：在一分钟周期上
 * 这是八小时以上的历史，而在长周期上交易场所有多少就返回多少。滚到左边缘会再翻一页同样大小的
 * 快照；实时柱子在此之上追加且从不裁剪，所以这是一个起始深度，而不是一个窗口。
 */
export const PERPS_CANDLE_LIMIT = 500;
/** Hyperliquid 每次请求最多提供多少根最近的 K 线。 */
export const PERPS_CANDLE_HISTORY_LIMIT = 5000;

/**
 * 当前是否可以信任实时数据源。`stale` 会把最后的数值留在屏幕上，但标明它们不再实时；它不是
 * 错误状态，而且数据源一恢复健康它就自行清除。
 */
export type PerpsConnectionState = 'connecting' | 'live' | 'stale';

/** `meta` info 请求返回的原始 `universe` 条目。 */
export type PerpsMarketMarginMode = 'strictIsolated' | 'noCross';

export interface PerpsUniverseItem {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  /** 当前的协议字段。它缺失表示支持全仓。 */
  marginMode?: PerpsMarketMarginMode;
  isDelisted?: boolean;
}

/** 来自 `metaAndAssetCtxs` 的原始资产上下文；所有数字都以字符串到达。 */
export interface PerpsAssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string | null;
  oraclePx: string;
  markPx: string;
  midPx: string | null;
  impactPxs: string[] | null;
}

/**
 * 界面所消费的市场：universe 条目与它的上下文合并后的结果。
 *
 * 交易场所报出的每一个值，都以它到达时的十进制字符串形式保留。这里刻意没有 `number` 的孪生
 * 字段：浮点副本正是调用方会顺手拿错的那个字段，而只要舍入一次，就足以给一笔订单定错价。
 * 改为在渲染边界处转换，并且绝不把结果写回来。
 */
export interface PerpsMarket {
  /** 市场主键 `dex:symbol`；光凭符号在多个 HIP-3 DEX 之间并不唯一。 */
  key: string;
  /** Hyperliquid 的资产下标，下单时必需。 */
  assetId: number;
  /** 标准永续 DEX 为空；否则是 HIP-3 部署方的 DEX 名。 */
  dex: string;
  /** 在本市场自己 DEX 元数据中的下标，实时上下文数组按它索引。 */
  dexAssetIndex: number;
  /** 协议币种；HIP-3 市场带 `dex:` 前缀。它是身份，不是展示用的。 */
  coin: string;
  /** 去掉 DEX 前缀的币种。只用于展示、搜索和图标匹配。 */
  symbol: string;
  szDecimals: number;
  maxLeverage: number;
  /** 精确的协议限制；为 null 表示支持全仓。 */
  marginMode: PerpsMarketMarginMode | null;
  markPxExact: string;
  /**
   * 盘口中间价，也是每一笔市价单据以定价的参考。Hyperliquid 自家前端换算数量和定价用的都是
   * 中间价而不是标记价格：标记价格是一个按预言机加权的数字，可能落在价差之外，那会把 IOC
   * 限价推得比容忍度所暗示的更深入盘口。市场没有双边盘口时为 `null` —— 是价格缺失，绝不是零。
   * 交易相关的代码必须要求它存在，绝不能退回到标记价格。
   */
  midPxExact: string | null;
  oraclePxExact: string;
  prevDayPxExact: string;
  /**
   * 过去 24 小时的百分比涨跌，例如 `"-3.12"`。当无法从同一种价格算出时为 `null` ——
   * 那是市场统计不可用，而不是 `0`。
   */
  changePercentExact: string | null;
  /**
   * 过去 24 小时以计价货币表示的价格变动，例如 `"-24.25"`。它与 `changePercentExact` 共享
   * 输入和 `null` 判定，因此两者绝不可能用不同的价格来描述同一次波动。
   */
  changeAmountExact: string | null;
  dayVolumeExact: string;
  openInterestSizeExact: string;
  openInterestExact: string;
  /** 以小数表示的每小时资金费率，例如 `"0.0000125"` */
  fundingExact: string;
}

export interface PerpsCandle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

/**
 * 一个持仓，按交易场所上报的精度保存。
 *
 * `sziExact` 是平仓方向和最大可平数量在协议层面的事实来源，所以这些值都没有浮点孪生字段 ——
 * 理由见 `PerpsMarket`。
 */
export interface PerpsPosition {
  /** 市场主键 `dex:symbol`，与 `PerpsMarket.key` 对应。 */
  key: string;
  /** 标准永续 DEX 为空；否则是 HIP-3 部署方的 DEX 名。 */
  dex: string;
  /** 协议币种；HIP-3 仓位带 `dex:` 前缀。 */
  coin: string;
  /** 去掉 DEX 前缀的币种。只用于展示和图标匹配。 */
  symbol: string;
  /** 有符号数量：正为多头，负为空头。 */
  sziExact: string;
  entryPxExact: string;
  positionValueExact: string;
  unrealizedPnlExact: string;
  /** 以小数表示的权益回报率，例如 `"0.142"` */
  returnOnEquityExact: string;
  /** 对于任何价格都不会被强平的仓位为 `null`。 */
  liquidationPxExact: string | null;
  /** 整数形式的杠杆设置；与价格不同，它作为 `number` 是精确的。 */
  leverage: number;
  leverageType: 'cross' | 'isolated';
  marginUsedExact: string;
  isLong: boolean;
}

/** 单个永续合约上按用户计的交易容量。元组顺序是 [多头, 空头]。 */
export interface PerpsActiveAssetData {
  user: string;
  coin: string;
  leverage: {
    type: 'cross' | 'isolated';
    value: number;
    rawUsd?: number;
  };
  /** 以基础资产单位计的最大订单数量，保留 API 给出的十进制原样。 */
  maxTradeSzs: [string, string];
  /** 每个方向以 USDC 计的可用抵押品，精确保留。 */
  availableToTrade: [string, string];
  markPxExact?: string;
  markPx: number;
}

export interface PerpsAccount {
  /**
   * 该地址是否运行统一账户（或组合保证金账户），由 `userAbstraction` 上报。在统一账户下，
   * 现货 USDC 余额就是全仓抵押品，而永续清算所的数字「无意义」（依据 Hyperliquid 文档）。
   * 在标准账户（`default`/`disabled`）下，现货和永续是两个独立钱包，所以现货 USDC 在通过
   * `usdClassTransfer` 划进永续之前撑不起任何仓位。
   */
  unified: boolean;
  /** Hyperliquid 返回的账户抽象模式原始值。 */
  abstractionMode: PerpsAccountMode;
  /** 这份快照覆盖的 DEX；标准永续清算所为空。 */
  dex: string;
  /** 永续清算所权益 —— 只对标准账户有意义。 */
  accountValueExact: string;
  /** 当前账户模式下可用的抵押品权益。 */
  totalBalanceExact: string;
  totalMarginUsedExact: string;
  totalNtlPosExact: string;
  /**
   * 以百分比表示的强平风险比率。统一账户/组合保证金账户需要跨全部 DEX 计算，因此目前不设置它。
   */
  marginRatioExact: string | null;
  /**
   * 永续清算所自己的 `withdrawable`：对标准账户来说它是自由抵押品，而对统一账户来说，无论有
   * 多少资金它都是 0。因此提现上限必须经由账户模式来读，而不能直接取这个值。
   */
  withdrawableExact: string;
  /**
   * 可用于下单或提现的自由抵押品。统一账户/组合保证金账户会把空闲的现货 USDC 折算进来；
   * 标准账户仍然只算永续。
   */
  availableBalanceExact: string;
  /**
   * 现货余额（代币下标 0）里的 USDC 总额。只有在统一账户下它才是全仓抵押品；在标准账户下它是
   * 一个必须先划进永续才能用于交易的独立钱包，因此绝不能把它折算进永续权益。
   */
  spotUsdcExact: string;
  /** 现货 USDC 中被占作保证金的部分（它的 hold）；在统一账户下才有意义。 */
  spotUsdcHoldExact: string;
  positions: PerpsPosition[];
}

/**
 * 首页所展示的账户：每个数字一行，由每个 DEX 各一份快照汇总而成。
 *
 * 求和只是展示上的便利。这些总额背后的资金池是各自独立计算保证金和强平的，这也正是保证金率
 * 不做求和的原因 —— 一个离强平只差一跳的池子，会消失在一个看起来很健康的总数里。
 */
export interface PerpsAggregatedAccount {
  unified: boolean;
  abstractionMode: PerpsAccountMode;
  /**
   * 对所有已上报的 DEX 求和。当携带账户模式和现货抵押品的那份标准永续快照缺失时，账户级数字
   * 就是未知的。`null` 表示未知；`'0'` 表示一个权威的零。
   */
  accountValueExact: string | null;
  totalBalanceExact: string | null;
  totalMarginUsedExact: string;
  totalNtlPosExact: string;
  withdrawableExact: string | null;
  availableBalanceExact: string | null;
  /**
   * 现货钱包，它是账户级的而不是按 DEX 分的。它只从标准永续那份快照读取；按 DEX 逐个相加，
   * 会把同一笔余额算上 DEX 个数那么多遍。
   */
  spotUsdcExact: string | null;
  spotUsdcHoldExact: string | null;
  /** 风险最高的那个资金池的保证金率，以及该池属于哪个 DEX。 */
  marginRatioExact: string | null;
  marginRatioDex: string | null;
  /** 跨所有 DEX 的全部持仓；每一个都带着它所属的 DEX。 */
  positions: PerpsPosition[];
  /**
   * 快照读取失败的那些 DEX。非空就意味着上面的总额只覆盖了账户的一部分，必须按不完整来呈现。
   */
  missingDexes: string[];
  /** 各 DEX 的快照，好让一次操作能被路由回它自己的资金池。 */
  byDex: PerpsAccount[];
}

export type PerpsAccountAvailability =
  | 'loading'
  | 'live'
  | 'incomplete'
  | 'stale'
  | 'unavailable';

/**
 * 一份实时的账户视图。传输故障在这里以状态表示，而不是终止整条流，这样同一个视图在重连之后
 * 还能恢复。
 */
export interface PerpsAccountState<T> {
  availability: PerpsAccountAvailability;
  account: T | null;
  missingDexes: string[];
  /** 最新一份可信快照或帧的客户端时间。 */
  updatedAt: number | null;
}

export type PerpsAccountMode =
  | 'default'
  | 'disabled'
  | 'dexAbstraction'
  | 'unifiedAccount'
  | 'portfolioMargin'
  | 'unknown';

export interface PerpsFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  dir: string;
  closedPnl: string;
  hash: string;
  fee: string;
  feeToken?: string;
  builderFee?: string;
  oid?: string;
  tid?: string;
}

export interface PerpsOpenOrder {
  coin: string;
  oid: string;
  side: 'B' | 'A';
  limitPx: string;
  sz: string;
  origSz: string;
  timestamp: number;
  orderType: string;
  reduceOnly: boolean;
  isTrigger?: boolean;
  triggerPx?: string;
  isPositionTpsl?: boolean;
}

/** 一笔已经离开盘口的订单，以及它到达的终态。 */
export interface PerpsHistoricalOrder {
  order: PerpsOpenOrder;
  /** filled | canceled | rejected | triggered | marginCanceled | open …… */
  status: string;
  statusTimestamp: number;
}

/**
 * 账户账本中不含资金费支付的一行：跨桥出入金、现货/永续之间的 class 划转，以及账户间转账。
 */
export interface PerpsLedgerUpdate {
  time: number;
  hash: string;
  delta: {
    /** deposit | withdraw | accountClassTransfer | internalTransfer | spotTransfer …… */
    type: string;
    usdc?: string;
    amount?: string;
    token?: string;
    fee?: string;
    /** 手续费以哪种代币计价；没有这个字段的行按 USDC 收取。 */
    feeToken?: string;
    /** 仅 accountClassTransfer 使用：为 true 表示现货 → 永续。 */
    toPerp?: boolean;
    destination?: string;
    user?: string;
  };
}

export type PerpsOrderSide = 'long' | 'short';
export type PerpsOrderType = 'market' | 'limit';
export type PerpsTradeIntent =
  | 'open'
  | 'increase'
  | 'reduce'
  | 'close'
  | 'reverse';

export interface PerpsSignature {
  r: string;
  s: string;
  v: number;
}

/** 推导一个协议订单所需的、用户已确认的那些事实。 */
export interface PerpsTradeOrderIntent {
  market: Pick<
    PerpsMarket,
    'key' | 'coin' | 'dex' | 'assetId' | 'szDecimals' | 'maxLeverage'
  >;
  operation: PerpsTradeIntent;
  side: PerpsOrderSide;
  /** 当前的成交参考价，或规范化之后的限价。 */
  referencePriceExact: string;
  /** 请求的基础数量；全平时忽略。 */
  requestedSizeExact: string;
  leverage: number;
  orderType: PerpsOrderType;
  /** 市价单允许的最大价格偏差，以百分比计，例如 1 表示 1%。 */
  maxSlippagePercent: number;
}

export interface PerpsExchangeResponse {
  status: 'ok' | 'err';
  response?: {
    type: string;
    data?: {
      statuses?: Array<
        | 'success'
        | { resting: { oid: string } }
        | { filled: { totalSz: string; avgPx: string; oid: string } }
        | { error: string }
      >;
    };
  };
  error?: string;
}

export type PerpsOrderExecutionStatus =
  | 'filled'
  | 'partial'
  | 'resting'
  | 'unfilled'
  | 'rejected'
  | 'unknown';

export interface PerpsOrderExecutionResult {
  status: PerpsOrderExecutionStatus;
  cloid: string;
  orderId?: string;
  submittedSizeExact: string;
  filledSizeExact: string;
  remainingSizeExact: string;
  averagePriceExact?: string;
  error?: string;
  raw?: PerpsExchangeResponse;
}

/** 待审核订单的仓位风险估算，按协议精度给出。 */
/**
 * 这个账户按盘口两侧分别被收取多少。
 *
 * 两者都是小数，例如 `0.00045` 表示 4.5 个基点。`makerRate` 可能为负：在 Hyperliquid 的返佣
 * 档位上，挂单成交是付钱给账户而不是收取账户的费用，而把费率钳到零的界面会把这一点藏起来。
 */
export interface PerpsUserFeeRates {
  takerRate: number;
  makerRate: number;
}

export interface PerpsOrderPreview {
  /** 以美元计的名义仓位价值。 */
  notionalExact: string;
  /** 被该仓位锁定的抵押品。 */
  marginExact: string;
  /** 以该币种基础单位计的数量。 */
  sizeExact: string;
  /**
   * 估算的强平价。当不存在正的估算值时为 `null` —— 绝不用 `0`，那会被读成「在零价位被强平」。
   */
  liquidationPxExact: string | null;
  /** 这笔成交的全部成本：交易场所手续费加 builder 费用。 */
  feeExact: string;
  /** Hyperliquid 自己的 taker 手续费。 */
  protocolFeeExact: string;
  /** NeoLine 的 builder 费用；没有配置 builder 地址时为零。 */
  builderFeeExact: string;
}
