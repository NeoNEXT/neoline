/**
 * Perpetual futures powered by Hyperliquid.
 * Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */

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
 * HIP-3 DEXes exposed by NeoLine in addition to Hyperliquid's canonical DEX.
 *
 * `perpDexs` is an unbounded registry (especially on testnet), so treating it
 * as a market list would fan one metadata request out to every deployed DEX
 * and exhaust Hyperliquid's shared IP rate limit. Keep product support
 * explicit instead.
 */
export const PERPS_HIP3_DEXES: {
  mainnet: string[];
  testnet: string[];
} = {
  mainnet: [],
  testnet: ['neol'],
};

/** Markets pinned to the top of the list and used by the "Neo 生态" filter. */
export const PERPS_NEO_COINS = ['NEO', 'GAS'];

export interface PerpsDepositConfig {
  chainId: number;
  rpc: string;
  chainName: string;
  symbol: string;
  decimals: number;
  /** ERC-20 the bridge credits — any other token sent to it is lost. */
  address: string;
  /** Bridge2 recipient that credits deposits to the transaction sender. */
  bridgeAddress: string;
}

/**
 * Hyperliquid is funded only through Bridge2: on mainnet it credits native
 * Circle USDC sent on Arbitrum One (bridged USDC.e is ignored and cannot be
 * recovered); on testnet it credits the mock USDC2 token on Arbitrum Sepolia,
 * not the Circle faucet USDC.
 */
export const PERPS_DEPOSIT_CONFIG: {
  mainnet: PerpsDepositConfig;
  testnet: PerpsDepositConfig;
} = {
  mainnet: {
    chainId: 42161,
    rpc: 'https://arb1.arbitrum.io/rpc',
    chainName: 'Arbitrum',
    symbol: 'USDC',
    decimals: 6,
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    bridgeAddress: '0x2df1c51E09aECF9cacB7bc98cB1742757f163dF7',
  },
  testnet: {
    chainId: 421614,
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    chainName: 'Arbitrum Sepolia',
    symbol: 'USDC',
    decimals: 6,
    address: '0x1baAbB04529D43a73232B713C0FE471f7c7334d5',
    bridgeAddress: '0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89',
  },
};

/** Bridge2 only credits native Circle USDC on Arbitrum; below this the deposit is lost. */
export const PERPS_MIN_DEPOSIT = 5;
/**
 * Not published in the Bridge2 docs the way the deposit floor is; it follows
 * from `PERPS_WITHDRAW_FEE` — the flat fee is taken out of the amount, so a
 * smaller withdrawal would leave the user with nothing.
 */
export const PERPS_MIN_WITHDRAW = 2;
/** Hyperliquid rejects ordinary and partial-close orders below this notional. */
export const PERPS_MIN_ORDER_NOTIONAL = 10;
/** Flat fee Hyperliquid charges on withdrawals, in USDC. */
export const PERPS_WITHDRAW_FEE = 1;

/**
 * NeoLine's builder fee, charged by Hyperliquid on top of its own taker/maker
 * rate and paid to the builder address below.
 *
 * The wire field `f` counts tenths of a basis point. The
 * approval the user signs is pinned to exactly this rate rather than to
 * Hyperliquid's 0.1% ceiling: an approval authorises everything up to the rate
 * it names, so approving more than is charged would leave headroom to raise the
 * fee without asking again.
 */
export const PERPS_BUILDER_FEE_RATE = 0;
export const PERPS_BUILDER_FEE_TENTHS_BPS = 0;
export const PERPS_BUILDER_MAX_FEE_RATE = '0.045%';

/**
 * Address collecting the builder fee, per network.
 *
 * Empty disables the fee entirely — no `builder` field on orders and no
 * approval prompt — so an unconfigured build trades at Hyperliquid's bare rate
 * instead of paying an unrelated address. Hyperliquid also requires the builder
 * to hold at least 100 USDC of perps account value before it will honour the
 * fee; below that it rejects every order carrying the field.
 */
export const PERPS_BUILDER_ADDRESS: { mainnet: string; testnet: string } = {
  mainnet: '',
  testnet: '',
};

/**
 * Slippage tolerance for market orders, in percent. A market order is an IOC
 * limit priced this far through the mark, so the bounds are shared by the form
 * and by the service that builds the order — a UI-only maximum would be clamped
 * away without the user noticing.
 *
 * The 100% ceiling matches Hyperliquid's own dialog, which accepts values up to
 * 100.00. It is deliberately permissive: at 100% the IOC limit sits at twice
 * (or zero times) the mark, which just means "fill me against whatever the book
 * holds".
 */
export const PERPS_MIN_SLIPPAGE_PERCENT = 0.1;
export const PERPS_MAX_SLIPPAGE_PERCENT = 10;
export const PERPS_DEFAULT_SLIPPAGE_PERCENT = 3;

export type PerpsMarketFilter = 'all' | 'neo' | 'major' | 'gainers';

export const PERPS_MAJOR_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'];

export const PERPS_CANDLE_INTERVALS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
] as const;
export type PerpsCandleInterval = typeof PERPS_CANDLE_INTERVALS[number];

/** Raw `universe` entry from the `meta` info request. */
export interface PerpsUniverseItem {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
  isDelisted?: boolean;
}

/** Raw asset context from `metaAndAssetCtxs`; all numbers arrive as strings. */
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

/** A market as consumed by the UI: universe entry joined with its context. */
export interface PerpsMarket {
  /** Hyperliquid asset index, required when placing orders. */
  assetId: number;
  /** Empty for the canonical DEX; otherwise the HIP-3 deployer DEX name. */
  dex?: string;
  /** Index inside this market's own DEX metadata, used by live context arrays. */
  dexAssetIndex?: number;
  coin: string;
  szDecimals: number;
  maxLeverage: number;
  /** The exchange rejects cross-margin leverage updates for this market. */
  onlyIsolated: boolean;
  markPx: number;
  /**
   * Book mid, and the reference every market order is priced from. Hyperliquid's
   * own front end sizes and prices against the mid rather than the mark: the
   * mark is an oracle-weighted figure that can sit outside the spread, which
   * would push an IOC limit further through the book than the tolerance implies.
   * Falls back to the mark when the exchange reports no mid (an empty book).
   */
  midPx: number;
  oraclePx: number;
  prevDayPx: number;
  /** Percent change over the last 24h, e.g. -3.12 */
  changePercent: number;
  dayVolume: number;
  openInterest: number;
  /** Hourly funding rate as a fraction, e.g. 0.0000125 */
  funding: number;
}

export interface PerpsOrderBookLevel {
  price: number;
  size: number;
}

export interface PerpsOrderBook {
  coin: string;
  time: number;
  /** Price-descending bids. */
  bids: PerpsOrderBookLevel[];
  /** Price-ascending asks. */
  asks: PerpsOrderBookLevel[];
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

export interface PerpsPosition {
  coin: string;
  /** Signed size: positive is long, negative is short. */
  szi: number;
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  /** Return on equity as a fraction, e.g. 0.142 */
  returnOnEquity: number;
  liquidationPx: number;
  leverage: number;
  leverageType: 'cross' | 'isolated';
  marginUsed: number;
  isLong: boolean;
}

/** Per-user trading capacity for one perp. Tuple order is [long, short]. */
export interface PerpsActiveAssetData {
  user: string;
  coin: string;
  leverage: {
    type: 'cross' | 'isolated';
    value: number;
    rawUsd?: number;
  };
  /** Maximum order size in base-asset units. */
  maxTradeSzs: [number, number];
  /** Maximum order notional in USDC for each direction. */
  availableToTrade: [number, number];
  markPx: number;
}

export interface PerpsAccount {
  /**
   * Whether the address runs a unified (or portfolio-margin) account, as
   * reported by `userAbstraction`. Under a unified account the spot USDC balance
   * is the cross-margin collateral and the perps clearinghouse figures are "not
   * meaningful" (per the Hyperliquid docs). Under a standard account
   * (`default`/`disabled`) spot and perps are separate wallets, so spot USDC
   * cannot back a position until a `usdClassTransfer` moves it into perps.
   */
  unified: boolean;
  /** Raw account abstraction value returned by Hyperliquid. */
  abstractionMode: PerpsAccountMode;
  /** Perps clearinghouse equity — only meaningful for a standard account. */
  accountValue: number;
  /** Collateral equity available to this account mode. */
  totalBalance: number;
  totalMarginUsed: number;
  totalNtlPos: number;
  /**
   * Liquidation-risk ratio as a percentage. Unified/portfolio accounts require
   * an all-DEX calculation and therefore leave this unset for now.
   */
  marginRatio: number | null;
  /** Free perps collateral to open positions or withdraw (standard account). */
  withdrawable: number;
  /** Exact decimal wire value; `withdrawable` is its display/calculation projection. */
  withdrawableExact: string;
  /**
   * Free collateral available for orders or withdrawal. Unified/portfolio
   * accounts fold in free spot USDC; standard accounts remain perps-only.
   */
  availableBalance: number;
  /** Exact decimal value used when a funding action submits MAX. */
  availableBalanceExact: string;
  /**
   * Total USDC in the spot balance (token index 0). This is the cross-margin
   * collateral only under a unified account; under a standard account it is a
   * separate wallet that must be transferred into perps before it can trade, so
   * it must not be folded into the perps equity.
   */
  spotUsdc: number;
  /** Exact decimal value used when a Spot → Perps transfer submits MAX. */
  spotUsdcExact: string;
  /** Portion of `spotUsdc` reserved as margin (its hold); meaningful when unified. */
  spotUsdcHold: number;
  /** Exact hold retained across clearinghouse websocket updates. */
  spotUsdcHoldExact: string;
  positions: PerpsPosition[];
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
  oid?: number;
  tid?: number;
}

export interface PerpsOpenOrder {
  coin: string;
  oid: number;
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

/** An order that left the book, with the terminal state it reached. */
export interface PerpsHistoricalOrder {
  order: PerpsOpenOrder;
  /** filled | canceled | rejected | triggered | marginCanceled | open ... */
  status: string;
  statusTimestamp: number;
}

/**
 * One row of the account ledger excluding funding payments: bridge deposits and
 * withdrawals, spot/perp class transfers, and account-to-account sends.
 */
export interface PerpsLedgerUpdate {
  time: number;
  hash: string;
  delta: {
    /** deposit | withdraw | accountClassTransfer | internalTransfer | spotTransfer ... */
    type: string;
    usdc?: string;
    amount?: string;
    token?: string;
    fee?: string;
    /** accountClassTransfer only: spot -> perp when true. */
    toPerp?: boolean;
    destination?: string;
    user?: string;
  };
}

export type PerpsOrderSide = 'long' | 'short';
export type PerpsOrderType = 'market' | 'limit';

export interface PerpsSignature {
  r: string;
  s: string;
  v: number;
}

export interface PerpsOrderRequest {
  assetId: number;
  isBuy: boolean;
  price: number;
  size: number;
  szDecimals: number;
  maxLeverage: number;
  leverage: number;
  orderType: PerpsOrderType;
  /** Maximum market-order price deviation as a percentage, e.g. 1 for 1%. */
  slippagePercent: number;
  reduceOnly: boolean;
  /** False for isolated-only markets and existing isolated positions. */
  isCross: boolean;
}

export interface PerpsExchangeResponse {
  status: 'ok' | 'err';
  response?: {
    type: string;
    data?: {
      statuses?: Array<
        | 'success'
        | { resting: { oid: number } }
        | { filled: { totalSz: string; avgPx: string; oid: number } }
        | { error: string }
      >;
    };
  };
  error?: string;
}

export interface PerpsOrderPreview {
  /** Notional position size in USD. */
  notional: number;
  /** Collateral locked by the position. */
  margin: number;
  /** Size in base units of the coin. */
  size: number;
  liquidationPx: number;
  /** Everything the fill costs: exchange fee plus builder fee. */
  fee: number;
  /** Hyperliquid's own taker fee. */
  protocolFee: number;
  /** NeoLine's builder fee; zero when no builder address is configured. */
  builderFee: number;
}
