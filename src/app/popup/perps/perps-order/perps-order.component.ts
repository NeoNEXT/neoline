import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Unsubscribable } from 'rxjs';
import BigNumber from 'bignumber.js';

import { AppState } from '@/app/reduers';
import {
  ChromeService,
  EvmWalletService,
  GlobalService,
} from '@/app/core';
import { HyperliquidService } from '@/app/core/services/perps/hyperliquid.service';
import { PerpsAccountStateService } from '@/app/core/services/perps/perps-account-state.service';
import { PerpsTradeOrderService } from '@/app/core/services/perps/perps-trade-order.service';
import { PerpsTradeOrderError } from '@/app/core/services/perps/perps-trade-order';
import { EvmWalletJSON } from '@popup/_lib/evm';
import { STORAGE_NAME } from '@popup/_lib';
import { PopupPerpsSlippageDialogComponent } from '@popup/_dialogs/perps-slippage/perps-slippage.dialog';
import {
  PerpsAccount,
  PerpsActiveAssetData,
  PerpsMarket,
  PerpsOrderPreview,
  PerpsOrderSide,
  PerpsOrderType,
  PerpsPosition,
  PerpsTradeOrderIntent,
  PERPS_BUILDER_FEE_RATE,
  PERPS_DEFAULT_SLIPPAGE_PERCENT,
  PERPS_HOME_URL,
  PERPS_MAX_SLIPPAGE_PERCENT,
  PERPS_MAX_ORDER_BUFFER_FRACTION,
  PERPS_MIN_ORDER_NOTIONAL,
  PERPS_MIN_SLIPPAGE_PERCENT,
} from '@popup/_lib/perps';
import {
  availableToTradeForSide,
  clampDecimals,
  collateralToNotional,
  exceedsMaxSlippage,
  formatBalance,
  formatFeeRatePercent,
  formatPrice,
  formatSignedPercent,
  formatSize,
  formatUsd,
  maxOrderNotionalForSide,
  normalizeLimitPrice,
  notionalAtLotSize,
  previewClosePosition,
  previewOrder,
  sizeAtLot,
} from '../perps.util';

/** Hyperliquid's base fees, used until `userFees` reports the real ones. */
const TAKER_FEE_RATE = 0.00045;
const MAKER_FEE_RATE = 0.00015;

/** USD amounts are typed and submitted to the cent. */
const AMOUNT_DECIMALS = 2;

/**
 * How hard the page tries to learn the fate of an order it could not read.
 *
 * A cloid resolves within a second or two when the exchange has an answer, so
 * a short fixed cadence finds one quickly; what matters more is that the
 * attempts end. An unbounded retry leaves the submit button disabled forever
 * on an order the exchange may never report, and the only escape the user had
 * was to leave the page — which loses the cloid altogether.
 */
const ORDER_RESOLUTION_ATTEMPTS = 4;
const ORDER_RESOLUTION_INTERVAL_MS = 1500;

/**
 * Reading for a summary row before an amount is typed, matching Hyperliquid's
 * own order form. Distinct from `--`, which this UI uses where the feed owes a
 * value and has not delivered one: here nothing is owed yet.
 */
const NOT_APPLICABLE = 'N/A';

/**
 * What the user approved, kept for the moment they press submit.
 *
 * Deliberately only their own input and the price they were shown: per the page
 * CONTEXT and ADR-0006 this is a review baseline, not a snapshot of the account,
 * the fees and the market. Its whole job is to answer two questions at submit
 * time — has the intent changed, and has the market moved further than the user
 * agreed to.
 */
interface PerpsReviewBaseline {
  /** The execution reference price on screen when the user reviewed. */
  priceExact: string;
  amount: string;
  limitPrice: string;
  side: PerpsOrderSide;
  orderType: PerpsOrderType;
  leverage: number;
  slippagePercent: number;
  closeMode: boolean;
}

@Component({
  templateUrl: 'perps-order.component.html',
  styleUrls: ['perps-order.component.scss'],
})
export class PerpsOrderComponent implements OnInit, OnDestroy {
  coin: string;
  market: PerpsMarket;
  /**
   * Whether this route names a market at all.
   *
   * A coin this build does not carry is a different answer from a market whose
   * feed has not arrived, and the form has to say which: without it a delisted
   * asset or a mistyped route leaves every row reading `--` forever.
   */
  marketStatus: 'loading' | 'ready' | 'missing' | 'error' = 'loading';
  account: PerpsAccount;
  position: PerpsPosition;
  activeAssetData: PerpsActiveAssetData;

  /** Close mode reduces an existing position instead of opening a new one. */
  closeMode = false;

  side: PerpsOrderSide = 'long';
  orderType: PerpsOrderType = 'market';
  /**
   * Both money boxes hold text, not numbers.
   *
   * These are the page's only inputs into signed values, and ADR-0001 keeps
   * those out of JavaScript floats: a `number` model turns a price typed on a
   * six-decimal market into whatever the nearest double is, and the box then
   * shows one price while the signature carries another.
   */
  limitPrice = '';
  amount = '';
  leverage = 1;
  slippagePercent = PERPS_DEFAULT_SLIPPAGE_PERCENT;
  activePercent: number = null;

  submitting = false;
  reviewing = false;
  accountLoadError = false;
  /**
   * The order was signed and sent, and the page never learned what became of
   * it. Not a failure — it may have filled — so the page says exactly that and
   * offers another look rather than an apology or a retry.
   */
  executionStatusUnknown = false;
  /** A cloid query is in flight, so "check again" would only stack another. */
  resolvingOrderStatus = false;
  readonly minOrderNotional = PERPS_MIN_ORDER_NOTIONAL;

  //#region template helpers
  formatPrice = formatPrice;
  formatSignedPercent = formatSignedPercent;
  formatBalance = formatBalance;
  //#endregion

  private address: string;
  private wallet: EvmWalletJSON;
  private accountSub: Unsubscribable;
  private accountStateSub: Unsubscribable;
  private marketsSub: Unsubscribable;
  private activeAssetDataSub: Unsubscribable;
  private userFeeSub: Unsubscribable;
  private leverageSelected = false;
  /** Locally confirmed write while the account stream catches up. */
  private confirmedLeverage: number = null;
  private takerFeeRate = TAKER_FEE_RATE;
  private makerFeeRate = MAKER_FEE_RATE;
  /** Close mode sizes itself from the position once, not on every frame. */
  private closeModeSeeded = false;
  private reviewBaseline: PerpsReviewBaseline = null;
  private pendingCloid: string = null;
  /** Blocks duplicate submission after a transport-ambiguous signed request. */
  private orderResolutionPending = false;
  private reconciliationTimer: ReturnType<typeof setTimeout>;
  /** Text being typed into a box, or null when it is showing the live value. */
  private percentDraft: string = null;
  private leverageDraft: string = null;
  /**
   * Chrome collapses a focus-time `select()` when the click's mouseup lands.
   * Suppressing that one mouseup keeps the whole value selected, so typing
   * replaces it; later clicks inside the box still position the caret.
   */
  private selectingOnFocus = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: Store<AppState>,
    private global: GlobalService,
    private hyperliquid: HyperliquidService,
    private accountStates: PerpsAccountStateService,
    private tradeOrders: PerpsTradeOrderService,
    private chrome: ChromeService,
    private evmWallet: EvmWalletService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.coin = this.route.snapshot.params.coin;
    this.closeMode = this.route.snapshot.queryParams.close === '1';
    const side = this.route.snapshot.queryParams.side;
    if (side === 'long' || side === 'short') {
      this.side = side;
    }

    this.loadMaxSlippage();
    this.accountSub = this.store.select('account').subscribe((state) => {
      const address = state.currentWallet?.accounts[0]?.address;
      this.wallet = state.currentWallet as EvmWalletJSON;
      if (address && address !== this.address) {
        this.address = address;
        this.loadActiveAssetData();
        this.loadAccount();
        this.loadUserFeeRates();
      }
    });
    this.loadMarket();
  }

  ngOnDestroy() {
    this.accountSub?.unsubscribe();
    this.accountStateSub?.unsubscribe();
    this.marketsSub?.unsubscribe();
    this.activeAssetDataSub?.unsubscribe();
    this.userFeeSub?.unsubscribe();
    clearTimeout(this.reconciliationTimer);
  }

  /** The DEX this route trades on; a HIP-3 coin carries it as a prefix. */
  private get dex(): string {
    return this.coin?.includes(':')
      ? this.coin.slice(0, this.coin.indexOf(':'))
      : '';
  }

  /**
   * This market's own feed, not the whole enabled-DEX universe.
   *
   * Finding one coin by pulling every DEX's context array is what the market
   * detail page stopped doing (see its ADR-0001), and the order form wants the
   * same one market this page is about.
   */
  private loadMarket() {
    this.marketsSub = this.hyperliquid.watchMarketDetail(this.coin).subscribe({
      next: (market) => {
        const initialLoad = !this.market;
        this.market = market ?? undefined;
        this.marketStatus = market ? 'ready' : 'missing';
        if (this.market && initialLoad) {
          // Seed the limit field with the same reference a market order uses,
          // already quantised to what this market can quote.
          this.limitPrice = normalizeLimitPrice(
            this.market.midPxExact,
            this.market.szDecimals
          );
          if (
            this.activeAssetData &&
            !this.leverageSelected &&
            this.activeAssetData.leverage.value >= 1 &&
            this.activeAssetData.leverage.value <= this.market.maxLeverage
          ) {
            this.leverage = this.activeAssetData.leverage.value;
          } else {
            // Default until the user's exchange-side leverage arrives.
            this.leverage = Math.min(2, this.market.maxLeverage);
          }
        }
      },
      error: () => {
        this.marketStatus = 'error';
      },
    });
  }

  /**
   * Max slippage is a habit rather than a property of any one market, so it is
   * remembered once for the wallet — the same way the chart interval is.
   */
  private loadMaxSlippage() {
    this.chrome
      .getStorage(STORAGE_NAME.perpsMaxSlippage)
      .subscribe((saved) => {
        // Storage answers with whatever an older build wrote, and the dialog's
        // range is the whole of the user's price consent — a value outside it
        // is not a preference worth restoring.
        const value = Number(saved);
        if (
          Number.isFinite(value) &&
          value >= PERPS_MIN_SLIPPAGE_PERCENT &&
          value <= PERPS_MAX_SLIPPAGE_PERCENT
        ) {
          this.slippagePercent = value;
        }
      });
  }

  private loadActiveAssetData() {
    this.activeAssetDataSub?.unsubscribe();
    this.activeAssetData = null;
    this.activeAssetDataSub = this.hyperliquid
      .watchActiveAssetData(this.address, this.coin)
      .subscribe((data) => {
        this.activeAssetData = {
          ...data,
          // Websocket updates omit markPx; retain the REST/market snapshot.
          markPx:
            data.markPx ||
            this.activeAssetData?.markPx ||
            Number(this.market?.markPxExact ?? 0),
        };
        if (
          data.leverage.type === 'isolated' &&
          data.leverage.value === this.confirmedLeverage
        ) {
          this.confirmedLeverage = null;
        }
        if (
          !this.closeMode &&
          !this.leverageSelected &&
          this.market &&
          data.leverage.value >= 1 &&
          data.leverage.value <= this.market.maxLeverage
        ) {
          this.leverage = data.leverage.value;
        }
        if (this.activePercent !== null && !this.closeMode) {
          this.setPercent(this.activePercent);
        }
      });
  }

  /**
   * The account, followed rather than polled.
   *
   * Position value moves with the mark price, and the close form's percentage
   * slider is measured against it — read once every few seconds it was a figure
   * that visibly lagged the price in the header. `watchAccount` seeds from REST
   * and then follows the account channel, so this is the page's one account
   * state kept current, not a second copy of it.
   *
   * The DEX comes from the route: a HIP-3 market's positions live in that
   * DEX's own clearinghouse, and asking the canonical one finds nothing —
   * which used to leave close, add and reverse silently inoperable there.
   */
  private loadAccount() {
    this.accountLoadError = false;
    this.accountStateSub?.unsubscribe();
    this.accountStateSub = this.accountStates
      .watchAccount(this.address, this.dex)
      .subscribe((state) => {
        this.accountLoadError = state.availability === 'unavailable';
        const account = state.account;
        this.account = account ?? undefined;
        this.position = account?.positions.find((p) => p.coin === this.coin);
        if (account) {
          // Seeding once: later frames must not overwrite an amount the user
          // has since typed.
          if (this.closeMode && this.position && !this.closeModeSeeded) {
            this.closeModeSeeded = true;
            // Closing means taking the opposite side of what is held.
            this.side = this.position.isLong ? 'short' : 'long';
            this.leverage = this.position.leverage;
            this.amount = new BigNumber(
              this.position.positionValueExact
            ).toFixed(AMOUNT_DECIMALS);
            this.activePercent = 100;
          }
        }
      });
  }

  /** Refresh the same state stream after an exchange write. */
  private refreshAccount() {
    if (this.address) {
      this.accountStates.refreshAccount(this.address, this.dex).subscribe();
    }
  }

  private loadUserFeeRates() {
    this.userFeeSub?.unsubscribe();
    this.takerFeeRate = TAKER_FEE_RATE;
    this.makerFeeRate = MAKER_FEE_RATE;
    this.userFeeSub = this.hyperliquid.getUserFeeRates(this.address).subscribe({
      next: ({ takerRate, makerRate }) => {
        this.takerFeeRate = takerRate;
        this.makerFeeRate = makerRate;
        if (this.activePercent !== null && !this.closeMode) {
          this.setPercent(this.activePercent);
        }
      },
      // The base rates remain a conservative fallback when userFees fails.
      error: () => {},
    });
  }

  get isLong(): boolean {
    return this.side === 'long';
  }

  /**
   * NeoLine's cut, charged by the exchange alongside its own fee. Zero unless a
   * builder address is configured for the active network, so a build without one
   * previews exactly what it will be charged.
   */
  get builderFeeRate(): number {
    return this.hyperliquid.builderAddress ? PERPS_BUILDER_FEE_RATE : 0;
  }

  get formattedBuilderFeeRate(): string {
    return formatFeeRatePercent(this.builderFeeRate);
  }

  /** Hyperliquid's own rates, as the fee tooltip itemises them. */
  get formattedTakerFeeRate(): string {
    return formatFeeRatePercent(this.takerFeeRate);
  }

  get formattedMakerFeeRate(): string {
    return formatFeeRatePercent(this.makerFeeRate);
  }

  /** Display name; the route's coin carries a DEX prefix on HIP-3 markets. */
  get symbol(): string {
    return this.market?.symbol ?? this.coin;
  }

  get positionSizeExact(): string {
    return new BigNumber(this.position?.sziExact ?? 0)
      .absoluteValue()
      .toFixed();
  }

  /** The same size at the market's lot precision, for display. */
  get formattedPositionSize(): string {
    return formatSize(this.positionSizeExact, this.market?.szDecimals);
  }

  /**
   * Free collateral for this direction, as Hyperliquid reports it, falling back
   * to the account-wide figure. A margin number: it does not move with leverage.
   */
  get availableExact(): string {
    if (this.activeAssetData) {
      return availableToTradeForSide(this.activeAssetData, this.side);
    }
    return this.account?.availableBalanceExact ?? '0';
  }

  get available(): number {
    return Number(this.availableExact);
  }

  /** What that collateral can open, capped by the exchange's per-asset size limit. */
  private get maxOrderNotional(): BigNumber {
    if (!this.activeAssetData) {
      return new BigNumber(
        collateralToNotional(this.available, this.leverage)
      );
    }
    return maxOrderNotionalForSide(
      this.activeAssetData,
      this.side,
      this.leverage,
      this.orderPrice
    );
  }

  get amountSliderPercent(): number {
    if (this.activePercent !== null) {
      return this.activePercent;
    }
    const base = this.percentBase;
    if (!base || !this.hasAmount) {
      return 0;
    }
    return Math.max(
      0,
      Math.min(100, this.amountExact.dividedBy(base).times(100).toNumber())
    );
  }

  get leverageSliderPercent(): number {
    const max = this.market?.maxLeverage || 1;
    return max === 1 ? 100 : ((this.leverage - 1) / (max - 1)) * 100;
  }

  get formattedMaxSlippage(): string {
    return `${Number(this.slippagePercent).toFixed(2)}%`;
  }

  /**
   * Price used for size, margin and liquidation calculations, and the reference
   * the market order's IOC limit is derived from.
   *
   * Market orders price off the book mid, as Hyperliquid's own front end does.
   * The mark is an oracle-weighted price that can sit outside the spread, so
   * using it would shift the slippage window off the prices actually on offer.
   */
  get orderPrice(): number {
    return Number(this.orderPriceExact) || 0;
  }

  get orderPriceExact(): string {
    if (this.orderType === 'limit') {
      const value = new BigNumber(this.limitPrice || 0);
      return value.isFinite() && value.isGreaterThan(0) ? value.toFixed() : '0';
    }
    return this.market?.midPxExact || '0';
  }

  /** The amount box as a number, whatever half-typed text it currently holds. */
  private get amountExact(): BigNumber {
    const value = new BigNumber(this.amount || 0);
    return value.isFinite() ? value : new BigNumber(0);
  }

  private get hasAmount(): boolean {
    return this.amountExact.isGreaterThan(0);
  }

  /**
   * Portfolio Margin's perps clearinghouse figures are meaningless, so an order
   * that adds risk cannot be sized or previewed on such an account. Closing is a
   * different question: a reduce-only close reads the position, not the account
   * numbers, and refusing it would leave the user holding risk they can only
   * exit somewhere else.
   */
  get unsupportedAccountMode(): boolean {
    return (
      !this.closeMode && this.account?.abstractionMode === 'portfolioMargin'
    );
  }

  /** NeoLine opens isolated orders and cannot change a live cross position. */
  get crossPositionUnsupported(): boolean {
    return !this.closeMode && this.position?.leverageType === 'cross';
  }

  /**
   * An order against a position the account already holds, on this form.
   *
   * NeoLine does not read it as a reverse (see the page CONTEXT on implicit
   * flip). The exchange has no "flip" order: a reverse is |position| + amount
   * on one ticket, so treating a $14 short against a $44 long as one would
   * sign $58 of risk against a preview that quoted the fee on $14. The user is
   * asked which they meant instead; the explicit reverse lives on the position.
   */
  get oppositePositionHeld(): boolean {
    return (
      !this.closeMode &&
      !!this.position &&
      this.position.isLong !== this.isLong
    );
  }

  /** Same market, same direction: this order adds to what is already open. */
  get increasesPosition(): boolean {
    return (
      !this.closeMode &&
      !!this.position &&
      this.position.isLong === this.isLong
    );
  }

  private get tradeIntent(): PerpsTradeOrderIntent['operation'] {
    if (this.closeMode) {
      return this.fullClose ? 'close' : 'reduce';
    }
    return this.position ? 'increase' : 'open';
  }

  get preview(): PerpsOrderPreview {
    if (!this.market || !this.hasAmount) {
      return null;
    }
    if (this.closeMode && this.position) {
      const closePreview = previewClosePosition({
        position: this.position,
        notionalExact: this.amount,
        szDecimals: this.market.szDecimals,
        feeRate: this.takerFeeRate,
        builderFeeRate: this.builderFeeRate,
        fullClose: this.fullClose,
      });
      return {
        notionalExact: new BigNumber(this.position.positionValueExact)
          .times(this.closeFractionExact)
          .toFixed(),
        marginExact: closePreview.releasedMarginExact,
        feeExact: closePreview.feeExact,
        protocolFeeExact: closePreview.protocolFeeExact,
        builderFeeExact: closePreview.builderFeeExact,
        sizeExact: closePreview.sizeExact,
        // Closing does not open exposure, so there is no liquidation price to
        // estimate — absent, not zero.
        liquidationPxExact: null,
      };
    }
    const preview = previewOrder({
      market: this.market,
      executionPriceExact: this.orderPriceExact,
      // The lot-floored notional, not the typed one: margin and fee are charged
      // on the size that reaches the exchange.
      notionalExact: this.executableNotional,
      leverage: this.leverage,
      isLong: this.isLong,
      feeRate: this.takerFeeRate,
      builderFeeRate: this.builderFeeRate,
      // Adding to an open position liquidates as one merged position, so the
      // estimate has to be built from both.
      position: this.increasesPosition ? this.position : null,
    });
    return {
      ...preview,
      sizeExact: this.orderSizeExact,
    };
  }

  /**
   * The summary rows below stay on screen with an empty amount box, so the user
   * can see what an order will be judged on before typing one. Each row reads
   * `N/A` until there is a preview to quote.
   */
  get liquidationPriceText(): string {
    const price = this.preview?.liquidationPxExact;
    return price
      ? `$${formatPrice(price, this.market?.szDecimals)}`
      : NOT_APPLICABLE;
  }

  /**
   * The exchange's liquidation price for the position already open, shown
   * beside the estimate while adding to it.
   *
   * The estimate is arithmetic on inputs; this is what Hyperliquid currently
   * says. Putting them side by side is the honest way to add to a position:
   * the user sees which way the estimate moves the real number, rather than
   * being handed one figure that silently replaces the other.
   */
  get currentLiquidationPriceText(): string {
    const price = this.position?.liquidationPxExact;
    return price
      ? `$${formatPrice(price, this.market?.szDecimals)}`
      : NOT_APPLICABLE;
  }

  get showsCurrentLiquidationPrice(): boolean {
    return this.increasesPosition && !!this.position?.liquidationPxExact;
  }

  get marginText(): string {
    return this.preview ? formatUsd(this.preview.marginExact) : NOT_APPLICABLE;
  }

  /**
   * Whether this market's fee can be quoted at all.
   *
   * A HIP-3 DEX takes the deployer's own share on top of the account rate, and
   * nothing in `userFees` reports it. Showing the canonical rate here would put
   * a number on screen that is knowably too low, so the row says so instead.
   * It does not block the order: the fee changes nothing about what is
   * submitted, and the fill reports what was actually taken.
   */
  get feeEstimateUnavailable(): boolean {
    return !!this.market?.dex;
  }

  /**
   * Whether both sides of the book are worth quoting.
   *
   * A market order always crosses, so the taker rate is the whole answer. A GTC
   * limit order usually rests and fills as maker, but it can also cross on the
   * way in, so the row shows both rather than picking one and being wrong half
   * the time.
   */
  get quotesBothFeeSides(): boolean {
    return this.orderType === 'limit';
  }

  /** Rate always, plus what it costs this order once one is sized. */
  get feeText(): string {
    return this.feeSideText(this.takerFeeRate);
  }

  get makerFeeText(): string {
    return this.feeSideText(this.makerFeeRate);
  }

  /**
   * A rate, and once the order is sized what it comes to in dollars.
   *
   * Both are the total charge — Hyperliquid's rate plus NeoLine's builder fee —
   * because that is what leaves the account. A negative total keeps its sign:
   * on a rebate tier the fill pays the account back, and flooring that at
   * "$0.00" would quietly delete money the user is owed.
   */
  private feeSideText(rate: number): string {
    const total = rate + this.builderFeeRate;
    const formattedRate = formatFeeRatePercent(total);
    const preview = this.preview;
    if (!preview) {
      return formattedRate;
    }
    const amount = new BigNumber(preview.notionalExact).times(total);
    return `${formattedRate} (${formatUsd(amount.toFixed())})`;
  }

  /** Whether the maker side pays the account rather than charging it. */
  get makerFeeIsRebate(): boolean {
    return this.makerFeeRate + this.builderFeeRate < 0;
  }

  /** Exact position fraction in close mode; mark-price conversion can drift. */
  private get orderSize(): number {
    return Number(this.orderSizeExact);
  }

  /**
   * What the order is actually worth once its size floors to the market lot.
   *
   * The typed amount overstates this by up to one lot, and the difference is
   * binding at both ends: Hyperliquid rejects an order under $10 measured this
   * way, and the margin and fee rows should quote the order being placed rather
   * than the number that was typed into the box.
   */
  private get executableNotional(): BigNumber {
    return new BigNumber(this.orderSizeExact).times(this.orderPriceExact);
  }

  /** Exact signed size, floored to the market lot without a Number round-trip. */
  private get orderSizeExact(): string {
    if (
      !this.market ||
      !this.hasAmount ||
      !new BigNumber(this.orderPriceExact).isGreaterThan(0)
    ) {
      return '0';
    }
    if (this.closeMode && this.position && this.fullClose) {
      return new BigNumber(this.position.sziExact)
        .absoluteValue()
        .toFixed();
    }
    return sizeAtLot(
      this.amountExact.dividedBy(this.orderPriceExact),
      this.market.szDecimals
    );
  }

  /**
   * The form displays two-decimal USD, so that rounded maximum must still mean
   * 100%; requiring it to equal the higher-precision API value leaves dust.
   */
  private get fullClose(): boolean {
    if (!this.closeMode || !this.position) {
      return false;
    }
    return (
      this.activePercent === 100 ||
      this.amountExact.isGreaterThanOrEqualTo(
        new BigNumber(this.position.positionValueExact).toFixed(
          AMOUNT_DECIMALS
        )
      )
    );
  }

  private get closeFractionExact(): string {
    const positionSize = new BigNumber(
      this.position?.sziExact ?? 0
    ).absoluteValue();
    return positionSize.isGreaterThan(0)
      ? new BigNumber(this.orderSizeExact).dividedBy(positionSize).toFixed()
      : '0';
  }

  /** Collateral the order needs; in close mode the position releases margin instead. */
  get requiredMarginExact(): string {
    return this.preview ? this.preview.marginExact : '0';
  }

  get insufficient(): boolean {
    if (this.closeMode || !this.hasAmount) {
      return false;
    }
    if (!this.market || !this.orderPrice) {
      return true;
    }
    const maxSize = sizeAtLot(
      this.maxOrderNotional.dividedBy(this.orderPrice),
      this.market.szDecimals
    );
    return new BigNumber(this.orderSizeExact).isGreaterThan(maxSize);
  }

  /**
   * Hyperliquid measures its $10 floor against the order it receives, so the
   * check has to run on the lot-floored notional too. $10 of a market that
   * trades in whole coins at $3.33 is three coins — $9.99 — which the form used
   * to accept and the exchange then rejected after the user had already signed.
   * A full close is exempt: the exchange lets a position out at any size.
   */
  get belowMinimum(): boolean {
    if (!this.hasAmount || !this.orderPrice) {
      return false;
    }
    if (this.closeMode && this.fullClose) {
      return false;
    }
    return this.executableNotional.isLessThan(this.minOrderNotional);
  }

  /**
   * A market order with nothing to price against.
   *
   * Not an error state of the feed: the market is live, it simply has no
   * two-sided book right now, so there is no execution reference price to size
   * an order or derive an IOC limit from. The mark is not a substitute — it can
   * sit outside the spread.
   */
  get noExecutionPrice(): boolean {
    return (
      this.marketStatus === 'ready' &&
      this.orderType === 'market' &&
      !new BigNumber(this.market?.midPxExact ?? 0).isGreaterThan(0)
    );
  }

  /**
   * The one thing standing between this form and a submitted order, or null.
   *
   * Only ever one: a form that lists every objection at once leaves the user
   * guessing which to fix first, so the checks are ordered from the ones no
   * amount of typing can fix down to the ones that depend on the amount.
   *
   * Everything here is a client-decidable condition (root CONTEXT) — identity,
   * protocol precision, a positive amount, the minimum notional, reduce-only
   * direction, available balance, market state and the user's own slippage.
   * Nothing else belongs: open-interest caps, oracle deviation and whether the
   * book can actually fill are the exchange's to judge, and per ADR-0006 a
   * client that guesses at them blocks legitimate orders instead of preventing
   * losses. Those come back as rejections, which this page translates.
   *
   * A box the user has not finished filling in is not a reason — an empty
   * amount or limit price leaves the button disabled, silently.
   */
  get orderUnavailableReason(): string | null {
    if (this.accountLoadError) {
      return 'perpsLoadFailed';
    }
    if (this.marketStatus === 'missing') {
      return 'perpsMarketNotFound';
    }
    if (this.marketStatus === 'error') {
      return 'perpsLoadFailed';
    }
    if (this.unsupportedAccountMode) {
      return 'perpsPortfolioUnsupported';
    }
    if (this.crossPositionUnsupported) {
      return 'perpsCrossPositionUnsupported';
    }
    if (this.oppositePositionHeld) {
      return this.position.isLong
        ? 'perpsHoldingLongChooseExit'
        : 'perpsHoldingShortChooseExit';
    }
    if (this.closeMode && this.account && !this.position) {
      return 'perpsNoPositionToClose';
    }
    if (this.noExecutionPrice) {
      return 'perpsNoExecutionPrice';
    }
    if (!this.slippageInRange) {
      return 'perpsSlippageOutOfRange';
    }
    if (!this.hasAmount) {
      return null;
    }
    if (this.insufficient) {
      return 'perpsInsufficientMargin';
    }
    if (this.belowMinimum) {
      return 'perpsBelowMinimum';
    }
    return null;
  }

  /** Values the one reason on screen interpolates, when it takes any. */
  get orderUnavailableParams(): { [key: string]: string | number } {
    return { min: this.minOrderNotional, symbol: this.symbol };
  }

  /** The dialog clamps, but storage answers with whatever an older build wrote. */
  private get slippageInRange(): boolean {
    return (
      Number.isFinite(this.slippagePercent) &&
      this.slippagePercent >= PERPS_MIN_SLIPPAGE_PERCENT &&
      this.slippagePercent <= PERPS_MAX_SLIPPAGE_PERCENT
    );
  }

  get canSubmit(): boolean {
    return (
      !this.submitting &&
      !this.orderResolutionPending &&
      this.marketStatus === 'ready' &&
      this.hasAmount &&
      !this.orderUnavailableReason &&
      new BigNumber(this.orderPriceExact).isGreaterThan(0) &&
      new BigNumber(this.preview?.sizeExact ?? 0).isGreaterThan(0)
    );
  }

  /**
   * Any change to the intent drops the review.
   *
   * The baseline exists to answer "is this still what was approved", so an
   * edit invalidates it rather than being compared against it — the user is
   * sent back to review the thing they just changed.
   */
  private discardReview() {
    this.reviewing = false;
    this.reviewBaseline = null;
    this.pendingCloid = null;
  }

  setSide(side: PerpsOrderSide) {
    if (this.closeMode) {
      return;
    }
    this.side = side;
    this.discardReview();
    if (this.activePercent !== null) {
      this.setPercent(this.activePercent);
    }
  }

  setOrderType(type: PerpsOrderType) {
    this.orderType = type;
    this.discardReview();
  }

  setLeverage(leverage: number) {
    const max = this.market?.maxLeverage || 1;
    this.leverage = Math.max(
      1,
      Math.min(max, Math.round(Number(leverage) || 1))
    );
    this.leverageSelected = true;
    this.discardReview();
    // The amount slider sizes off buying power, which just changed with leverage.
    if (this.activePercent !== null && !this.closeMode) {
      this.setPercent(this.activePercent);
    }
  }

  /**
   * What the leverage box shows. While it has focus it echoes the typed text
   * verbatim, so clamping never fights the caret or refills a box the user is
   * clearing; leaving the field falls back to the value actually in effect.
   */
  get leverageBoxText(): string {
    return this.leverageDraft === null
      ? String(this.leverage)
      : this.leverageDraft;
  }

  onLeverageFocus(input: HTMLInputElement) {
    this.leverageDraft = input.value;
    this.selectingOnFocus = true;
    input.select();
  }

  /** Typing recalculates on every keystroke, exactly as dragging does. */
  onLeverageInput(value: string) {
    this.leverageDraft = value;
    this.setLeverage(Number(value));
  }

  onLeverageBlur() {
    this.leverageDraft = null;
  }

  /**
   * The amount slider sizes the order off buying power (collateral × leverage) when
   * opening, and off the position value when closing.
   */
  setPercent(percent: number) {
    this.activePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    this.discardReview();
    // Floor to the cent the box displays, never round. The base is already the
    // largest notional this market's lot can express, so rounding the last cent
    // up buys one lot more than the exchange allows and the form ends up
    // rejecting its own 100%. Wherever a lot is worth less than half a cent —
    // the low-priced markets, kPEPE and kBONK among them — that is a routine
    // outcome rather than an edge case.
    const amount =
      this.activePercent === 100 && !this.closeMode
        ? this.bufferedMaxOrderNotional
        : new BigNumber(this.percentBase)
            .times(this.activePercent)
            .dividedBy(100);
    this.amount = amount
      .decimalPlaces(AMOUNT_DECIMALS, BigNumber.ROUND_FLOOR)
      .toFixed();
  }

  /** See {@link leverageBoxText}; the percentage box works the same way. */
  get percentBoxText(): string {
    return this.percentDraft === null
      ? String(Math.round(this.amountSliderPercent))
      : this.percentDraft;
  }

  onPercentFocus(input: HTMLInputElement) {
    this.percentDraft = input.value;
    this.selectingOnFocus = true;
    input.select();
  }

  onPercentInput(value: string) {
    this.percentDraft = value;
    this.setPercent(Number(value));
  }

  onPercentBlur() {
    this.percentDraft = null;
  }

  /** Shared by both boxes; see {@link selectingOnFocus}. */
  onBoxMouseUp(event: MouseEvent) {
    if (this.selectingOnFocus) {
      this.selectingOnFocus = false;
      event.preventDefault();
    }
  }

  /**
   * Cents are the most this order can express, so a third decimal never reaches
   * the model: it is dropped as it is typed rather than accepted and then
   * explained, the same way the transfer screen's amount field behaves.
   *
   * The box is written back to directly because a property binding will not do
   * it here: rejecting the keystroke leaves the model on the value it already
   * held, Angular sees nothing to update, and the digit the model refused stays
   * on screen — a box showing more precision than the order carries.
   */
  onAmountInput(input: HTMLInputElement) {
    const clamped = clampDecimals(input.value, AMOUNT_DECIMALS);
    if (input.value !== clamped) {
      input.value = clamped;
    }
    this.amount = clamped;
    this.activePercent = null;
    this.discardReview();
  }

  onLimitPriceInput(value: string) {
    this.limitPrice = value;
    this.discardReview();
  }

  /**
   * Quantise the typed price to the market's tick and put the result back in
   * the box, so what the user reads is what gets signed. Doing it on blur
   * rather than per keystroke leaves a half-typed price alone: "1.2" on its way
   * to "1.25" must not be rewritten under the caret.
   */
  onLimitPriceBlur() {
    const normalized = normalizeLimitPrice(
      this.limitPrice,
      this.market?.szDecimals
    );
    if (normalized !== this.limitPrice) {
      this.limitPrice = normalized;
      this.discardReview();
    }
  }

  openSlippageDialog() {
    this.dialog
      .open(PopupPerpsSlippageDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          value: this.slippagePercent,
          min: PERPS_MIN_SLIPPAGE_PERCENT,
          max: PERPS_MAX_SLIPPAGE_PERCENT,
        },
      })
      .afterClosed()
      .subscribe((value: number) => {
        if (typeof value !== 'number') {
          return;
        }
        this.slippagePercent = Number(
          Math.max(
            PERPS_MIN_SLIPPAGE_PERCENT,
            Math.min(PERPS_MAX_SLIPPAGE_PERCENT, value)
          ).toFixed(2)
        );
        this.chrome.setStorage(
          STORAGE_NAME.perpsMaxSlippage,
          this.slippagePercent
        );
        this.discardReview();
      });
  }

  /**
   * Base the percentage buttons size against. Order sizes snap down to the
   * market's lot, so the largest notional that can actually rest is the
   * quantised one — 100% must land there, not on the raw buying power, or the
   * amount shown is one the exchange would trim anyway.
   */
  private get percentBase(): number {
    if (this.closeMode) {
      return Number(this.position?.positionValueExact ?? 0);
    }
    return this.market
      ? notionalAtLotSize(
          this.maxOrderNotional,
          this.orderPrice,
          this.market.szDecimals
        )
      : this.maxOrderNotional.toNumber();
  }

  get theoreticalBuyingPower(): number {
    return this.maxOrderNotional.toNumber();
  }

  get bufferedMaxOrderNotional(): BigNumber {
    if (!this.market) {
      return new BigNumber(0);
    }
    const buffered = this.maxOrderNotional.times(
      new BigNumber(1).minus(PERPS_MAX_ORDER_BUFFER_FRACTION)
    );
    const size = sizeAtLot(
      buffered.dividedBy(this.orderPriceExact),
      this.market.szDecimals
    );
    return new BigNumber(size).times(this.orderPriceExact);
  }

  get nearMarginLimit(): boolean {
    const amount = this.amountExact;
    return (
      !this.closeMode &&
      amount.isGreaterThan(this.bufferedMaxOrderNotional) &&
      amount.isLessThanOrEqualTo(this.maxOrderNotional)
    );
  }

  get ctaLabel(): string {
    if (!this.reviewing) {
      return 'perpsReviewOrder';
    }
    if (this.closeMode) {
      return this.position?.isLong ? 'perpsCloseLong' : 'perpsCloseShort';
    }
    return this.isLong ? 'perpsLong' : 'perpsShort';
  }

  review() {
    if (!this.canSubmit) {
      return;
    }
    // The price the user is about to be shown, kept so submit can tell whether
    // the market has since moved further than they agreed to.
    this.reviewBaseline = {
      priceExact: this.orderPriceExact,
      amount: this.amount,
      limitPrice: this.limitPrice,
      side: this.side,
      orderType: this.orderType,
      leverage: this.leverage,
      slippagePercent: this.slippagePercent,
      closeMode: this.closeMode,
    };
    this.reviewing = true;
  }

  /** Whether the form still holds the intent the baseline was taken from. */
  private get intentChanged(): boolean {
    const baseline = this.reviewBaseline;
    return (
      !baseline ||
      baseline.amount !== this.amount ||
      baseline.limitPrice !== this.limitPrice ||
      baseline.side !== this.side ||
      baseline.orderType !== this.orderType ||
      baseline.leverage !== this.leverage ||
      baseline.slippagePercent !== this.slippagePercent ||
      baseline.closeMode !== this.closeMode
    );
  }

  /**
   * Whether the market left the window the user agreed to.
   *
   * Checked before the wallet is unlocked, so a market that ran away is
   * refused while the user still has an order to fix, rather than after they
   * have already signed one. A limit order prices itself and cannot drift,
   * which makes this inert there — as it should be.
   */
  private get priceMovedBeyondSlippage(): boolean {
    return exceedsMaxSlippage(
      this.reviewBaseline?.priceExact,
      this.orderPriceExact,
      this.slippagePercent
    );
  }

  /** Send the user back to review, saying why. */
  private requireReview(message: string) {
    this.discardReview();
    this.global.snackBarTip(message);
  }

  async submit() {
    if (!this.canSubmit || !this.reviewing || !this.reviewBaseline) {
      return;
    }
    if (this.intentChanged || this.priceMovedBeyondSlippage) {
      this.requireReview('perpsMarketChangedReviewAgain');
      return;
    }
    const walletExtra = this.wallet?.accounts[0]?.extra;
    if (walletExtra?.ledgerSLIP44 || walletExtra?.qrBasedXFP) {
      this.global.snackBarTip('perpsSigningUnavailable');
      return;
    }
    this.submitting = true;
    try {
      const password = await this.chrome.getPassword();
      const privateKey = await this.evmWallet.getPrivateKey(
        this.wallet,
        password
      );
      const intent: PerpsTradeOrderIntent = {
        market: {
          key: this.market.key,
          coin: this.market.coin,
          dex: this.market.dex,
          assetId: this.market.assetId,
          szDecimals: this.market.szDecimals,
          maxLeverage: this.market.maxLeverage,
        },
        operation: this.tradeIntent,
        side: this.side,
        referencePriceExact: this.orderPriceExact,
        requestedSizeExact: this.orderSizeExact,
        leverage: this.leverage,
        orderType: this.orderType,
        maxSlippagePercent: this.slippagePercent,
        currentLeverage:
          (this.confirmedLeverage === this.leverage
            ? { type: 'isolated', value: this.confirmedLeverage }
            : this.activeAssetData?.leverage),
      };
      this.tradeOrders
        .submit(privateKey, intent)
        .subscribe({
          next: (submission) => {
            this.submitting = false;
            if (submission.kind === 'leverage-updated') {
              this.discardReview();
              this.confirmedLeverage = submission.leverage;
              this.activeAssetData = this.activeAssetData
                ? {
                    ...this.activeAssetData,
                    leverage: {
                      type: 'isolated',
                      value: submission.leverage,
                    },
                  }
                : this.activeAssetData;
              this.refreshAccount();
              this.global.snackBarTip('perpsLeverageUpdatedReviewAgain');
              return;
            }
            const result = submission.result;
            const message = {
              filled: 'perpsOrderFilled',
              partial: 'perpsOrderPartiallyFilled',
              resting: 'perpsOrderResting',
              unfilled: 'perpsOrderUnfilled',
              rejected: 'perpsOrderRejected',
              unknown: 'perpsOrderUnknown',
            }[result.status];
            this.global.snackBarTip(message, result.error);
            if (result.status === 'unknown') {
              this.startOrderResolution(result.cloid);
              return;
            }
            if (result.status === 'filled') {
              this.router.navigateByUrl(PERPS_HOME_URL);
            } else {
              this.discardReview();
              this.refreshAccount();
            }
          },
          error: (error) => {
            this.submitting = false;
            if (
              error instanceof PerpsTradeOrderError &&
              error.code === 'position-changed'
            ) {
              this.requireReview('perpsPositionChangedReviewAgain');
            } else {
              this.global.snackBarTip('txFailed', error?.message || error);
            }
          },
        });
    } catch (error) {
      this.submitting = false;
      this.global.snackBarTip('verifyFailed', error?.message || error);
    }
  }

  /**
   * Ask the exchange what became of a signed order it did not answer for.
   *
   * Per ADR-0006 this is a query and a refresh, nothing more: the cloid is
   * asked about, and whatever comes back is read off the account. No intent is
   * persisted, nothing is re-signed, and there is no local order state machine
   * to fall out of sync.
   */
  private startOrderResolution(cloid: string) {
    this.pendingCloid = cloid;
    this.orderResolutionPending = true;
    this.executionStatusUnknown = false;
    this.resolvingOrderStatus = true;
    this.queryOrderStatus(cloid, ORDER_RESOLUTION_ATTEMPTS);
  }

  /** The "check again" button, once the page has run out of its own attempts. */
  retryOrderResolution() {
    if (!this.pendingCloid || this.resolvingOrderStatus) {
      return;
    }
    this.startOrderResolution(this.pendingCloid);
  }

  viewHistory() {
    this.router.navigateByUrl('/popup/perps/history');
  }

  private queryOrderStatus(cloid: string, attemptsLeft: number) {
    clearTimeout(this.reconciliationTimer);
    this.reconciliationTimer = setTimeout(() => {
      this.hyperliquid.getOrderStatus(this.address, cloid).subscribe({
        next: (result) => {
          if (result?.status === 'order') {
            this.resolveOrderStatus();
            return;
          }
          // Any other answer means the exchange has nothing to report yet,
          // which is not the same as nothing having happened.
          this.retryOrGiveUp(cloid, attemptsLeft);
        },
        error: () => this.retryOrGiveUp(cloid, attemptsLeft),
      });
    }, ORDER_RESOLUTION_INTERVAL_MS);
  }

  private retryOrGiveUp(cloid: string, attemptsLeft: number) {
    if (attemptsLeft > 1) {
      this.queryOrderStatus(cloid, attemptsLeft - 1);
      return;
    }
    // Out of attempts. Submission stays blocked — a second order is how one
    // position becomes two — but the page now says so and offers a way on,
    // rather than sitting on a permanently disabled button.
    this.resolvingOrderStatus = false;
    this.executionStatusUnknown = true;
    this.refreshAccount();
  }

  private resolveOrderStatus() {
    this.orderResolutionPending = false;
    this.executionStatusUnknown = false;
    this.resolvingOrderStatus = false;
    this.pendingCloid = null;
    this.reviewing = false;
    this.reviewBaseline = null;
    this.refreshAccount();
    this.global.snackBarTip('perpsOrderStatusResolved');
  }

  back() {
    history.go(-1);
  }
}
