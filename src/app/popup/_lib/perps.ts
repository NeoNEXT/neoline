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

/**
 * Where a perps sub-page returns to. Perps is a tab of the home screen rather
 * than a route of its own, so the parameter is the only thing that tells home
 * to reopen it instead of dropping the user back on assets.
 */
export const PERPS_HOME_URL = '/popup/home?tab=perps';

export interface PerpsDepositConfig {
  chainId: number;
  /**
   * Endpoints for the deposit chain, tried in order.
   *
   * Unlike the RPC list on a wallet network, the user never chose these: the
   * deposit chain is an implementation detail of the funding route, so rotating
   * away from a dead endpoint is not swapping out a node the user picked. Every
   * entry must serve the same chain id, which is checked before use.
   */
  rpcUrls: string[];
  chainName: string;
  symbol: string;
  /** The chain's own currency — what the network fee is actually paid in. */
  nativeSymbol: string;
  decimals: number;
  /** How USDC leaves this chain for HyperCore. */
  cctp: PerpsCctpSourceConfig;
}

/**
 * The CCTP side of a deposit chain.
 *
 * Kept as its own block through the migration because the retired route
 * disagreed about which token is credited — on testnet Bridge2 took a mock
 * USDC2 while CCTP burns Circle's own USDC — and sending one to the other is
 * unrecoverable. Nothing reads the old fields now, but the grouping still says
 * which protocol these addresses belong to.
 */
export interface PerpsCctpSourceConfig {
  /** Circle's `CctpExtension`: authorisation and burn in one source transaction. */
  extension: string;
  /** Native Circle USDC — the only token the burn accepts. */
  usdc: string;
  /** CCTP domain of this chain, not its EVM chain id. */
  sourceDomain: number;
}

/**
 * Hyperliquid is funded through Circle's CCTP on Arbitrum: only native Circle
 * USDC is burned, and bridged USDC.e sent to the same contracts is not
 * recoverable.
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
 * Funding thresholds, kept together because they are exchange rules rather
 * than interface choices — scattering them across screens is how one copy ends
 * up disagreeing with another.
 *
 * SOURCE, verified 2026-08-18 against primary sources. The two Bridge2 figures
 * below describe the route being retired; the CCTP route that replaces them
 * quotes its fee per operation rather than publishing a constant, so no fee
 * belongs in this file. Whatever the quote says, the amount actually taken is
 * read back from the exchange ledger — a quote is a ceiling, not a receipt.
 */

/**
 * Product floor for a deposit, not a protocol rule.
 *
 * On Bridge2 this number was the point below which a deposit was silently lost.
 * CCTP has no such threshold — Circle documents that deposits of any size are
 * credited — so the floor survives only as a product decision to match
 * Hyperliquid's own interface. Copy must not claim that a smaller deposit is
 * lost, because on this route it is not. The protocol's own floor is the fee
 * quote: below that the destination chain reverts.
 */
export const PERPS_MIN_DEPOSIT = 5;
/** Hyperliquid rejects ordinary and partial-close orders below this notional. */
export const PERPS_MIN_ORDER_NOTIONAL = 10;
/** Safety reserve applied only when the user chooses Max / 100%. */
export const PERPS_MAX_ORDER_BUFFER_FRACTION = 0.005;

/** Hyperliquid quotes perp prices at up to six decimals, less `szDecimals`. */
export const PERPS_PRICE_MAX_DECIMALS = 6;
/** …and at no more than five significant figures, whichever binds first. */
export const PERPS_PRICE_SIGNIFICANT_FIGURES = 5;

/**
 * Decimal places Hyperliquid accepts for one market's prices.
 *
 * Both of its limits apply at once and the tighter one wins, so the answer
 * depends on the price as well as the market: on a market ticking at four
 * decimals, $0.5432 keeps all four while $1234.5 keeps one.
 *
 * This is the rule the wire price is quantised against, so the order form
 * normalises the typed limit price through it too — otherwise the signature
 * would carry a price the user never saw.
 */
export function perpsPriceDecimals(
  price: number,
  szDecimals: number
): number {
  const maxDecimals = Math.max(0, PERPS_PRICE_MAX_DECIMALS - szDecimals);
  const magnitude = Math.abs(price);
  // No magnitude to count significant figures from; the tick alone decides.
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
 * HyperEVM, read-only: the chain that prices a withdrawal.
 *
 * A withdrawal never becomes a transaction the user signs here — it is a signed
 * exchange action, and HyperEVM only appears because the contract that decides
 * the forwarding fee lives on it. The wallet reads that contract and nothing
 * else on this chain.
 */
export const PERPS_HYPEREVM_CONFIG = {
  mainnet: {
    chainId: 999,
    chainName: 'HyperEVM',
    /** The deposit chain this pairs with; mixing the two strands funds. */
    pairedDepositChainId: 42161,
    rpcUrls: [
      'https://rpc.hyperliquid.xyz/evm',
      'https://hyperliquid.drpc.org',
    ],
    /** Prices the withdrawal and performs the burn; pausable and upgradeable. */
    coreDepositWallet: '0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24',
    /** Receives the deposit mint and forwards it to the HyperCore account. */
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

/** CCTP domain of HyperEVM — the destination both directions are quoted against. */
export const PERPS_CCTP_HYPEREVM_DOMAIN = 19;

/**
 * Circle's fee endpoint for the deposit direction, per network.
 *
 * Testnet quotes come from the sandbox Iris host. The two networks share
 * source domain `3`, so a single URL would fetch mainnet rates on testnet and
 * then send them as `maxFee` on a burn — the quote would be describing a
 * different route than the one about to run.
 *
 * `forward=true&hyperCoreDeposit=true` is what makes the answer describe our
 * route: without them the same path prices a plain HyperEVM transfer, whose fee
 * is a different number that would be quoted to the user as if it were ours.
 */
export const PERPS_CCTP_FEE_API = {
  mainnet: 'https://iris-api.circle.com/v2/burn/USDC/fees',
  testnet: 'https://iris-api-sandbox.circle.com/v2/burn/USDC/fees',
};

/**
 * HyperCore's user-exists precompile, read to decide whether Circle's new
 * account fee applies to a deposit. It answers whether the account exists, not
 * whether it has been activated — the one-time activation fee is Hyperliquid's
 * and is not visible here.
 */
export const PERPS_CORE_USER_EXISTS_PRECOMPILE =
  '0x0000000000000000000000000000000000000810';

/**
 * Gas limit carried by the HyperCore-to-HyperEVM leg of a withdrawal.
 *
 * Hyperliquid documents this transfer as costing 200k gas at the base gas price
 * of the next HyperEVM block. It is not the user's own transaction — nobody
 * signs an EVM transaction to withdraw — so this is the protocol's figure
 * rather than something to estimate.
 */
export const PERPS_CORE_TO_EVM_GAS_LIMIT = 200000;

/**
 * Where on HyperCore a deposit lands: 0 is the perpetuals balance.
 *
 * The spot balance is `0xFFFFFFFF`, and this product never sends there — money
 * credited to spot cannot be traded or withdrawn from inside NeoLine, so
 * depositing to it would manufacture a stranded balance on purpose.
 */
export const PERPS_CCTP_DEX_PERPS = 0;

/**
 * How long a signed deposit authorisation stays usable.
 *
 * It has to outlive the confirmation dialog, and no longer: the authorisation
 * lets the extension contract pull exactly this amount, so its window is the
 * period in which a leaked signature would still be worth something.
 */
export const PERPS_DEPOSIT_AUTH_VALIDITY_SECONDS = 1800;

/** Fast Transfer. The slower threshold is not offered, so it is not configurable. */
export const PERPS_CCTP_FINALITY_FAST = 1000;

/**
 * Multiplier applied to the estimated gas limit of a CCTP deposit.
 *
 * Circle's own example uses the same 20%: an authorisation plus an external
 * call estimates tightly, and a deposit that runs out of gas still burns what
 * it used. The confirmation screen shows the network fee at this buffered
 * limit, never the bare estimate — the figure a user is shown has to be the
 * most they can be charged. Applied as tenths (12/10) so the multiply never
 * goes through Number: `1.15 * 100` is not 115, and `BigInt` of that residue
 * is a RangeError.
 */
export const PERPS_DEPOSIT_GAS_BUFFER = 1.2;

/**
 * How often the funding screen re-reads the source-chain token balance.
 *
 * The perps account arrives over a websocket, but the wallet's own balance sits
 * on another chain with no such feed, so it is polled. Fifteen seconds is short
 * enough that a deposit made elsewhere shows up while the screen is open, and
 * long enough not to hammer a public RPC while the user types.
 */
export const PERPS_WALLET_BALANCE_POLL_MS = 15000;

/**
 * Resilience policy for the deposit chain's public endpoints.
 *
 * The numbers follow MetaMask's own `RpcService`, which retries four times with
 * exponential backoff before giving up on an endpoint. Its retriable set is
 * reproduced in the deposit chain service: transient transport failures only,
 * never a business error, and nothing at all while the browser reports itself
 * offline.
 */
export const PERPS_CHAIN_MAX_RETRIES = 4;
export const PERPS_CHAIN_RETRY_BASE_MS = 250;
export const PERPS_CHAIN_REQUEST_TIMEOUT_MS = 10000;
/**
 * How long a deposit is watched for its receipt before the screen stops waiting.
 *
 * Reaching it is not a failure: the transaction is broadcast and may confirm
 * later, so it becomes a pending deposit rather than an error.
 */
export const PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS = 90000;

/** How often a pending deposit is re-checked, and how long it is followed. */
export const PERPS_PENDING_DEPOSIT_POLL_MS = 10000;
export const PERPS_PENDING_DEPOSIT_MAX_MS = 300000;

/**
 * A bridge deposit that has been broadcast but whose funds are not yet usable.
 *
 * Persisted, because the popup closing must not lose sight of money in flight.
 * It holds public transaction parameters only — never a key, a password or
 * anything that could be replayed.
 */
export interface PerpsPendingDeposit {
  /** Which deposit chain this was sent on, so a network switch cannot confuse it. */
  chainId: number;
  /** The sending address, which is also the address the bridge credits. */
  address: string;
  amountExact: string;
  hash: string;
  startedAt: number;
  /** True once the transfer has a receipt on the deposit chain with a successful status. */
  chainConfirmed: boolean;
  /**
   * True once the source-chain transaction is known to have reverted.
   *
   * A settled ending, not a slow one: the USDC was never burned, so no credit
   * is coming and the record must stop reading as something still in flight.
   */
  reverted?: boolean;
  /**
   * Withdrawable balance before the deposit was sent, read the way the account
   * mode says to read it. The credit has landed when that balance rises above
   * this, which is the only signal the exchange gives that the bridge is done.
   */
  withdrawableBeforeExact: string;
}

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
 * Whether a value from outside this build is an interval it still ships.
 *
 * Storage answers with whatever an older version wrote, which is not
 * necessarily an interval that still exists. Case matters here as everywhere
 * else: `1M` and `1m` are different intervals, so this is a membership test
 * and never a normalisation.
 */
export function isCandleInterval(value: unknown): value is PerpsCandleInterval {
  return PERPS_CANDLE_INTERVALS.includes(value as PerpsCandleInterval);
}

/**
 * How each interval is written on screen.
 *
 * Display and protocol are deliberately separate strings. Hyperliquid's daily
 * and weekly intervals are lowercase `1d` and `1w`, while its monthly one is
 * `1M` — a single capital away from `1m`, the minute. Only these labels are
 * ever shown, and only the protocol values are ever compared, stored, or sent;
 * a case-insensitive comparison anywhere between the two turns a month into a
 * minute without failing.
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
 * How many candles one snapshot holds.
 *
 * Sized for scrolling back rather than for the initial view, which shows about
 * thirty: at one minute this is over eight hours of history, and on the long
 * intervals the exchange simply returns however much the market has. Reaching
 * the left edge pages another snapshot of this size; live bars are appended
 * from there and never trimmed, so this is a starting depth and not a window.
 */
export const PERPS_CANDLE_LIMIT = 500;
/** Maximum number of recent candles Hyperliquid makes available per request. */
export const PERPS_CANDLE_HISTORY_LIMIT = 5000;

/**
 * Whether the live feed can be trusted right now. `stale` keeps the last values
 * on screen but marks them as no longer live; it is not an error state, and it
 * clears itself the moment the feed is healthy again.
 */
export type PerpsConnectionState = 'connecting' | 'live' | 'stale';

/** Raw `universe` entry from the `meta` info request. */
export type PerpsMarketMarginMode = 'strictIsolated' | 'noCross';

export interface PerpsUniverseItem {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  /** Current protocol field. Absence means cross margin is supported. */
  marginMode?: PerpsMarketMarginMode;
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
  /** Exact protocol restriction; null means cross margin is supported. */
  marginMode: PerpsMarketMarginMode | null;
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
  /**
   * Price change over the last 24h in quote currency, e.g. `"-24.25"`. Shares
   * `changePercentExact`'s inputs and its `null`, so the two can never quote
   * the same move from different prices.
   */
  changeAmountExact: string | null;
  dayVolumeExact: string;
  openInterestSizeExact: string;
  openInterestExact: string;
  /** Hourly funding rate as a fraction, e.g. `"0.0000125"` */
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
  /**
   * The perps clearinghouse's own `withdrawable`, which is free collateral for a
   * standard account and 0 for a unified one however funded it is. A withdrawal
   * ceiling must therefore be read through the account mode rather than taken
   * from here directly.
   */
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
  /**
   * Sums over every DEX that reported. Account-level figures are unknown when
   * the canonical snapshot, which carries account mode and spot collateral, is
   * missing. `null` is unknown; `'0'` is an authoritative zero.
   */
  accountValueExact: string | null;
  totalBalanceExact: string | null;
  totalMarginUsedExact: string;
  totalNtlPosExact: string;
  withdrawableExact: string | null;
  availableBalanceExact: string | null;
  /**
   * The spot wallet, which is account-wide rather than per DEX. It is read from
   * the canonical snapshot alone; adding it up per DEX would count one balance
   * as many times as there are DEXes.
   */
  spotUsdcExact: string | null;
  spotUsdcHoldExact: string | null;
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

export type PerpsAccountAvailability =
  | 'loading'
  | 'live'
  | 'incomplete'
  | 'stale'
  | 'unavailable';

/**
 * A live account view. Transport failures are represented here rather than by
 * terminating the stream, so the same view can recover after a reconnect.
 */
export interface PerpsAccountState<T> {
  availability: PerpsAccountAvailability;
  account: T | null;
  missingDexes: string[];
  /** Client time of the newest trusted snapshot or frame. */
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
    /** Token the fee is denominated in; absent rows are charged in USDC. */
    feeToken?: string;
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

/** User-confirmed facts needed to derive one protocol order. */
export interface PerpsTradeOrderIntent {
  market: Pick<
    PerpsMarket,
    'key' | 'coin' | 'dex' | 'assetId' | 'szDecimals' | 'maxLeverage'
  >;
  operation: PerpsTradeIntent;
  side: PerpsOrderSide;
  /** Current execution reference or normalized limit price. */
  referencePriceExact: string;
  /** Base size requested; ignored for a full close. */
  requestedSizeExact: string;
  leverage: number;
  orderType: PerpsOrderType;
  /** Maximum market-order price deviation as a percentage, e.g. 1 for 1%. */
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

/** Estimated position risk for an order under review, at protocol precision. */
/**
 * What this account is charged, per side of the book.
 *
 * Both are fractions, e.g. `0.00045` for 4.5bps. `makerRate` may be negative:
 * on Hyperliquid's rebate tiers a resting fill pays the account rather than
 * charging it, and a UI that floors the rate at zero hides that.
 */
export interface PerpsUserFeeRates {
  takerRate: number;
  makerRate: number;
}

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
