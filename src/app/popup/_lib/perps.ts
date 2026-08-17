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
  mainnet: ['xyz'],
  testnet: ['xyz'],
};

/** Markets pinned above the sorted market list, alongside favourites. */
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
/** Safety reserve applied only when the user chooses Max / 100%. */
export const PERPS_MAX_ORDER_BUFFER_FRACTION = 0.005;
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
export const PERPS_BUILDER_FEE_TENTHS_BPS = 45;
export const PERPS_BUILDER_FEE_RATE = PERPS_BUILDER_FEE_TENTHS_BPS / 100000;
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
 * limit priced this far through the book mid, so the bounds are shared by the
 * form and by the service that builds the order — a UI-only maximum would be
 * clamped away without the user noticing.
 *
 * The 0.1–10% range is deliberately tighter than Hyperliquid's own dialog, which
 * accepts anything up to 100.00 — at that ceiling the IOC limit sits at twice
 * (or zero times) the mid, which amounts to "fill me against whatever the book
 * holds". Ten percent is already far wider than any liquid market needs, so the
 * cap costs nothing on a legitimate order and catches a mistyped tolerance
 * before it is signed.
 */
export const PERPS_MIN_SLIPPAGE_PERCENT = 0.1;
export const PERPS_MAX_SLIPPAGE_PERCENT = 10;
export const PERPS_DEFAULT_SLIPPAGE_PERCENT = 3;

/**
 * What the market list can be ordered by.
 *
 * Both figures are visible on every row. A sort the user cannot see the basis
 * of — funding rate, say, which lives on the market detail — produces an order
 * that reads as arbitrary, so it is not offered here.
 */
export type PerpsMarketSortKey = 'volume' | 'change';

/** Rows materialised per batch; the list is long enough to need batching. */
export const PERPS_MARKET_PAGE_SIZE = 30;

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

/**
 * Whether the live feed can be trusted right now. `stale` keeps the last values
 * on screen but marks them as no longer live; it is not an error state, and it
 * clears itself the moment the feed is healthy again.
 */
export type PerpsConnectionState = 'connecting' | 'live' | 'stale';

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

/**
 * A market as consumed by the UI: universe entry joined with its context.
 *
 * Every value the exchange quotes is kept as the decimal string it arrived as.
 * There is deliberately no `number` twin: a float copy is the field callers
 * reach for by accident, and rounding it once is enough to misprice an order.
 * Convert at the render boundary instead, and never write the result back.
 */
export interface PerpsMarket {
  /** Market key `dex:symbol`; symbols alone are not unique across HIP-3 DEXes. */
  key: string;
  /** Hyperliquid asset index, required when placing orders. */
  assetId: number;
  /** Empty for the canonical DEX; otherwise the HIP-3 deployer DEX name. */
  dex: string;
  /** Index inside this market's own DEX metadata, used by live context arrays. */
  dexAssetIndex: number;
  /** Protocol coin; HIP-3 markets carry a `dex:` prefix. Identity, not display. */
  coin: string;
  /** Coin without its DEX prefix. Display, search and icon matching only. */
  symbol: string;
  szDecimals: number;
  maxLeverage: number;
  /** The exchange rejects cross-margin leverage updates for this market. */
  onlyIsolated: boolean;
  markPxExact: string;
  /**
   * Book mid, and the reference every market order is priced from. Hyperliquid's
   * own front end sizes and prices against the mid rather than the mark: the
   * mark is an oracle-weighted figure that can sit outside the spread, which
   * would push an IOC limit further through the book than the tolerance implies.
   * `null` when the market has no two-sided book — an absent price, never zero.
   * Trading code must require it and never fall back to the mark.
   */
  midPxExact: string | null;
  oraclePxExact: string;
  prevDayPxExact: string;
  /**
   * Percent change over the last 24h, e.g. `"-3.12"`. `null` when it cannot be
   * computed from one price kind — market statistics unavailable, not `0`.
   */
  changePercentExact: string | null;
  dayVolumeExact: string;
  openInterestSizeExact: string;
  openInterestExact: string;
  /** Hourly funding rate as a fraction, e.g. `"0.0000125"` */
  fundingExact: string;
}

export interface PerpsOrderBookLevel {
  priceExact?: string;
  sizeExact?: string;
  /** Ephemeral UI projection. Never use for order construction. */
  price: number;
  /** Ephemeral UI projection. Never use for order construction. */
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

/**
 * An open position, in the precision the exchange reports it.
 *
 * `sziExact` is the protocol-level truth for close direction and maximum
 * closable size, so no float twin exists for any of these values — see
 * `PerpsMarket` for the reasoning.
 */
export interface PerpsPosition {
  /** Market key `dex:symbol`, matching `PerpsMarket.key`. */
  key: string;
  /** Empty for the canonical DEX; otherwise the HIP-3 deployer DEX name. */
  dex: string;
  /** Protocol coin; HIP-3 positions carry a `dex:` prefix. */
  coin: string;
  /** Coin without its DEX prefix. Display and icon matching only. */
  symbol: string;
  /** Signed size: positive is long, negative is short. */
  sziExact: string;
  entryPxExact: string;
  positionValueExact: string;
  unrealizedPnlExact: string;
  /** Return on equity as a fraction, e.g. `"0.142"` */
  returnOnEquityExact: string;
  /** `null` for positions that cannot be liquidated at any price. */
  liquidationPxExact: string | null;
  /** Whole-number leverage setting; exact as a `number`, unlike a price. */
  leverage: number;
  leverageType: 'cross' | 'isolated';
  marginUsedExact: string;
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
  /** Maximum order size in base-asset units, preserved from the API decimal. */
  maxTradeSzs: [string, string];
  /** Available collateral in USDC for each direction, preserved exactly. */
  availableToTrade: [string, string];
  markPxExact?: string;
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
  /** The DEX this snapshot covers; empty for the canonical clearinghouse. */
  dex: string;
  /** Perps clearinghouse equity — only meaningful for a standard account. */
  accountValueExact: string;
  /** Collateral equity available to this account mode. */
  totalBalanceExact: string;
  totalMarginUsedExact: string;
  totalNtlPosExact: string;
  /**
   * Liquidation-risk ratio as a percentage. Unified/portfolio accounts require
   * an all-DEX calculation and therefore leave this unset for now.
   */
  marginRatioExact: string | null;
  /** Free perps collateral to open positions or withdraw (standard account). */
  withdrawableExact: string;
  /**
   * Free collateral available for orders or withdrawal. Unified/portfolio
   * accounts fold in free spot USDC; standard accounts remain perps-only.
   */
  availableBalanceExact: string;
  /**
   * Total USDC in the spot balance (token index 0). This is the cross-margin
   * collateral only under a unified account; under a standard account it is a
   * separate wallet that must be transferred into perps before it can trade, so
   * it must not be folded into the perps equity.
   */
  spotUsdcExact: string;
  /** Portion of spot USDC reserved as margin (its hold); meaningful when unified. */
  spotUsdcHoldExact: string;
  positions: PerpsPosition[];
}

/**
 * The account as the home page shows it: one row per figure, assembled from one
 * snapshot per DEX.
 *
 * Summing is a display convenience. The pools behind these totals are margined
 * and liquidated independently, which is why the margin ratio is not summed —
 * a pool one tick from liquidation disappears inside a healthy-looking total.
 */
export interface PerpsAggregatedAccount {
  unified: boolean;
  abstractionMode: PerpsAccountMode;
  /** Sums over every DEX that reported. */
  accountValueExact: string;
  totalBalanceExact: string;
  totalMarginUsedExact: string;
  totalNtlPosExact: string;
  withdrawableExact: string;
  availableBalanceExact: string;
  /**
   * The spot wallet, which is account-wide rather than per DEX. It is read from
   * the canonical snapshot alone; adding it up per DEX would count one balance
   * as many times as there are DEXes.
   */
  spotUsdcExact: string;
  spotUsdcHoldExact: string;
  /** The riskiest pool's margin ratio, and which DEX that pool belongs to. */
  marginRatioExact: string | null;
  marginRatioDex: string | null;
  /** Every open position across DEXes; each carries the DEX it belongs to. */
  positions: PerpsPosition[];
  /**
   * DEXes whose snapshot could not be read. Non-empty means the sums above
   * cover only part of the account and must be presented as incomplete.
   */
  missingDexes: string[];
  /** The per-DEX snapshots, so an action can be routed back to its own pool. */
  byDex: PerpsAccount[];
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

export interface PerpsOrderRequest {
  /** Protocol coin identifier used by REST/WS and signing. */
  coin: string;
  /** Stable `(dex, coin)` identity; symbols alone are not globally unique. */
  marketKey: string;
  /** Explicit semantic operation; reverse targets a new opposite position. */
  intent?: PerpsTradeIntent;
  assetId: number;
  isBuy: boolean;
  /** Price the user reviewed, kept exact until the wire price is derived. */
  price: string | number;
  /** Decimal base size; the service floors it to szDecimals before signing. */
  size: string;
  /**
   * USD intent frozen on review. For market orders the service fetches a fresh
   * two-sided L2 book immediately before signing and recomputes base size from
   * this amount. Omit only for an explicit base-asset quantity intent.
   */
  notionalExact?: string;
  /** Full closes keep the exact position quantity instead of rescaling by USD. */
  fullClose?: boolean;
  szDecimals: number;
  maxLeverage: number;
  leverage: number;
  orderType: PerpsOrderType;
  /** Maximum market-order price deviation as a percentage, e.g. 1 for 1%. */
  slippagePercent: number;
  reduceOnly: boolean;
  /** False for isolated-only markets and existing isolated positions. */
  isCross: boolean;
  /** Exchange-side setting used to avoid signing an identical update. */
  currentLeverage?: PerpsActiveAssetData['leverage'];
  /** Stable 16-byte id reused while this exact intent is unresolved. */
  cloid?: string;
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

/** Estimated position risk for an order under review, at protocol precision. */
export interface PerpsOrderPreview {
  /** Notional position size in USD. */
  notionalExact: string;
  /** Collateral locked by the position. */
  marginExact: string;
  /** Size in base units of the coin. */
  sizeExact: string;
  /**
   * Estimated liquidation price. `null` when no positive estimate exists —
   * never `0`, which would read as "liquidates at zero".
   */
  liquidationPxExact: string | null;
  /** Everything the fill costs: exchange fee plus builder fee. */
  feeExact: string;
  /** Hyperliquid's own taker fee. */
  protocolFeeExact: string;
  /** NeoLine's builder fee; zero when no builder address is configured. */
  builderFeeExact: string;
}
