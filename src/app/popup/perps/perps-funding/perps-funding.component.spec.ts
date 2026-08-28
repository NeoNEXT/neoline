import BigNumber from 'bignumber.js';
import { of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';

import { ChromeService, EvmWalletService, GlobalService } from '@/app/core';
import {
  HyperliquidService,
} from '@/app/core/services/perps/hyperliquid.service';
import {
  PerpsExchangeWriteService,
  PerpsExecutionStatusUnknownError,
} from '@app/core/services/perps/perps-exchange-write.service';
import { PerpsDepositChainService } from '@/app/core/services/perps/perps-deposit-chain.service';
import { PerpsFeeQuoteService } from '@/app/core/services/perps/perps-fee-quote.service';
import { PerpsPendingDepositsService } from '@/app/core/services/perps/perps-pending-deposits.service';
import { PerpsFundingComponent } from './perps-funding.component';

/**
 * A withdrawal is priced by a quote rather than a constant, so these tests state
 * the quote they compute against. One USDC keeps the arithmetic legible; the
 * real figure is whatever the contract says at the time.
 */
const QUOTE = { feeExact: '1', maxFeeExact: '1' };

/** No deposit is sent in these tests, so nothing is ever recorded as pending. */
const pendingStub = () =>
  ({
    listFor: () => Promise.resolve([]),
    add: () => Promise.resolve(),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    isStalled: () => false,
    isCredited: () => false,
  } as any);

/**
 * Preparing a deposit fails in these tests, and the failure is reported rather
 * than swallowed, so the component needs somewhere to report it to.
 */
const globalStub = () => ({ snackBarTip: () => {} } as any);

/** Quotes are never taken in these tests; no deposit is prepared or sent. */
const feeQuoteStub = () =>
  ({
    depositQuote: () => Promise.reject(new Error('not stubbed')),
    withdrawQuote: () => Promise.resolve({ ...QUOTE }),
    minWithdrawExact: (quote: { feeExact: string }) =>
      new BigNumber(quote.feeExact).times(2).toFixed(),
  } as any);

/** The deposit chain is never reached in these tests; only withdrawals run. */
const depositChainStub = () =>
  ({
    tokenBalanceExact: () => Promise.reject(new Error('not stubbed')),
    nativeBalanceExact: () => Promise.reject(new Error('not stubbed')),
    authorizeDeposit: () => Promise.reject(new Error('not stubbed')),
    depositFeeExact: () => Promise.reject(new Error('not stubbed')),
    sendDeposit: () => Promise.reject(new Error('not stubbed')),
    depositOutcome: () => Promise.resolve('pending'),
  } as any);

/** Keep direct construction focused on the page while preserving its account seam. */
const accountStateStub = (hyperliquid: any = {}) =>
  ({
    watchAccount: () =>
      of({
        availability: 'live',
        account: null,
        missingDexes: [],
        updatedAt: null,
      }),
    refreshAccount: (address: string, dex = '') => {
      const request = hyperliquid.getAccount?.(address, true, dex);
      return request
        ? request.pipe(
            map((account) => ({
              availability: 'live',
              account,
              missingDexes: [],
              updatedAt: Date.now(),
            }))
          )
        : of({
            availability: 'live',
            account: {
              abstractionMode: 'default',
              withdrawableExact: '100',
            },
            missingDexes: [],
            updatedAt: Date.now(),
          });
    },
  } as any);


/**
 * Rendering tests, which the rest of this file cannot replace.
 *
 * Everything above builds the component with `new` and asserts on its getters.
 * That leaves the template free to read something else — and it did: the
 * balance line read `account.withdrawableExact` (the raw protocol field, 0 for
 * a unified account) rather than the identically named getter beside it, so a
 * funded account was shown $0.00 while every getter around it was correct.
 * These tests assert on the rendered text for that reason.
 */
@Pipe({ name: 'translate' })
class TranslateStubPipe implements PipeTransform {
  transform(value: string) {
    return of(value);
  }
}

const writesStub = () =>
  jasmine.createSpyObj('PerpsExchangeWriteService', ['withdraw']);

describe('PerpsFundingComponent balance line', () => {
  let fixture: ComponentFixture<PerpsFundingComponent>;
  let component: PerpsFundingComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PerpsFundingComponent, TranslateStubPipe],
      imports: [FormsModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams: {} } },
        },
        // No wallet in the store, so nothing is loaded and the account under
        // test is only ever the one each case sets.
        {
          provide: Store,
          useValue: { select: () => of({ currentWallet: null }) },
        },
        { provide: GlobalService, useValue: globalStub() },
        {
          provide: HyperliquidService,
          useValue: {
            depositConfig: {
              decimals: 6,
              symbol: 'USDC',
              chainName: 'Arbitrum Sepolia',
              nativeSymbol: 'ETH',
            },
            watchConnectionState: () => of('live'),
          },
        },
        { provide: ChromeService, useValue: {} },
        { provide: EvmWalletService, useValue: {} },
        { provide: PerpsDepositChainService, useValue: depositChainStub() },
        { provide: PerpsFeeQuoteService, useValue: feeQuoteStub() },
        { provide: PerpsPendingDepositsService, useValue: pendingStub() },
        { provide: PerpsExchangeWriteService, useValue: writesStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerpsFundingComponent);
    component = fixture.componentInstance;
    component.tab = 'withdraw';
  });

  afterEach(() => fixture.destroy());

  /** The line under the amount input: the only place this figure is shown. */
  const balanceLine = () =>
    fixture.nativeElement
      .querySelector('.balance-tip')
      .textContent.replace(/\s+/g, ' ')
      .trim();

  it('shows a unified account the balance it can actually withdraw', () => {
    component.account = {
      unified: true,
      abstractionMode: 'unifiedAccount',
      withdrawableExact: '0',
      spotUsdcExact: '975.603457',
      spotUsdcHoldExact: '0',
    } as any;
    fixture.detectChanges();

    expect(balanceLine()).toContain('$975.60');
  });

  it('shows a standard account its perps balance, not its stranded spot', () => {
    component.account = {
      unified: false,
      abstractionMode: 'default',
      withdrawableExact: '40',
      spotUsdcExact: '100',
      spotUsdcHoldExact: '0',
    } as any;
    fixture.detectChanges();

    expect(balanceLine()).toContain('$40.00');
    expect(balanceLine()).not.toContain('$140');
  });

  it('shows an unread balance as unknown rather than as zero', () => {
    component.account = null;
    fixture.detectChanges();

    expect(balanceLine()).toContain('$--');
  });
});

describe('PerpsFundingComponent amount boundaries', () => {
  let component: PerpsFundingComponent;

  beforeEach(() => {
    component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      null,
      globalStub(),
      { depositConfig: { decimals: 6 } } as any,
      accountStateStub(),
      null,
      null,
      depositChainStub(),
      feeQuoteStub(),
      pendingStub(),
      null,
      writesStub()
    );
    component.withdrawQuote = { ...QUOTE };
  });

  it('uses the exact token balance for deposit MAX', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalanceExact = '1.234567';
    component.setMax();

    expect(component.amount).toBe('1.234567');
    expect(component.exceedsBalance).toBeFalse();
  });

  it('does not lose one USDC base unit from an exact MAX balance', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalanceExact = '2.000005';
    component.setMax();

    expect(component.amount).toBe('2.000005');
    expect((component as any).submissionAmount).toBe('2.000005');
    expect(component.exceedsBalance).toBeFalse();
  });

  it('blocks amounts with more decimals than the funding token supports', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalanceExact = '10';
    component.amount = '5.0000001';

    expect(component.amountExceedsPrecision).toBeTrue();
    expect(component.canSubmit).toBeFalse();
  });

  // The exchange would sign eight decimals, but the withdrawal is delivered as
  // USDC on the destination chain, which carries six.
  it('holds a withdrawal to the decimals the destination token carries', () => {
    component.tab = 'withdraw';
    component.amount = '2.000001';

    expect(component.amountDecimals).toBe(6);
    expect(component.amountExceedsPrecision).toBeFalse();

    component.amount = '2.0000001';
    expect(component.amountExceedsPrecision).toBeTrue();
  });

  it('drops decimals the deposit token cannot carry as they are typed', () => {
    component.activePreset = 25;
    const input = { value: '5.0000001' } as HTMLInputElement;

    component.onAmountInput({ target: input } as any);

    expect(input.value).toBe('5.000000');
    expect(component.amount).toBe('5.000000');
    expect(component.amountExceedsPrecision).toBeFalse();
    expect(component.activePreset).toBeNull();
  });

  it('drops decimals a withdrawal could not be paid out in either', () => {
    component.tab = 'withdraw';
    const input = { value: '2.000000019' } as HTMLInputElement;

    component.onAmountInput({ target: input } as any);

    expect(input.value).toBe('2.000000');
    expect(component.amount).toBe('2.000000');
    expect(component.amountExceedsPrecision).toBeFalse();
  });

  it('preserves exact withdraw MAX without converting through Number', () => {
    component.tab = 'withdraw';
    component.account = {
      abstractionMode: 'default',
      withdrawableExact: '9007199254740993.000001',
    } as any;
    component.accountLoading = false;

    component.setMax();

    expect(component.amount).toBe('9007199254740993.000001');
    expect((component as any).submissionAmount).toBe(
      '9007199254740993.000001'
    );
    expect(component.exceedsBalance).toBeFalse();
  });

  it('floors withdraw MAX to the payable precision instead of offering a rejected amount', () => {
    component.tab = 'withdraw';
    // The exchange reports withdrawable with more decimals than the token that
    // eventually pays it out can carry.
    component.account = {
      abstractionMode: 'default',
      withdrawableExact: '12.3456789012345',
    } as any;
    component.accountLoading = false;

    component.setMax();

    expect(component.amount).toBe('12.345678');
    expect(component.amountExceedsPrecision).toBeFalse();
    expect(component.exceedsBalance).toBeFalse();
    expect(component.canSubmit).toBeTrue();
  });

  it('draws a unified account ceiling from spot, where that account keeps its USDC', () => {
    component.tab = 'withdraw';
    // The perps clearinghouse reports 0 for a unified account however funded it
    // is, so reading it here shows a funded account $0 and blocks every
    // withdrawal it can make. Its hold is reserved collateral, not withdrawable.
    component.account = {
      abstractionMode: 'unifiedAccount',
      unified: true,
      withdrawableExact: '0',
      spotUsdcExact: '975.6',
      spotUsdcHoldExact: '75.6',
    } as any;
    component.accountLoading = false;

    component.amount = '901';
    expect(component.exceedsBalance).toBeTrue();

    component.setMax();
    expect(component.amount).toBe('900');
  });

  it('leaves a standard account spot balance out of the withdrawal ceiling', () => {
    component.tab = 'withdraw';
    // Standard accounts hold spot and perps as separate wallets: that spot USDC
    // is stranded until a transfer moves it and cannot leave through this page.
    component.account = {
      abstractionMode: 'default',
      unified: false,
      withdrawableExact: '40',
      spotUsdcExact: '100',
      spotUsdcHoldExact: '0',
    } as any;
    component.accountLoading = false;

    component.amount = '100';
    expect(component.exceedsBalance).toBeTrue();

    component.setMax();
    expect(component.amount).toBe('40');
  });

  it('treats an unreadable balance as unknown rather than zero', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalanceExact = null;

    expect(component.maxAmountKnown).toBeFalse();

    component.setMax();
    // Nothing to offer, so nothing is filled in — and an amount typed against
    // an unknown balance cannot be called "over balance" either.
    expect(component.amount).toBeNull();
    component.amount = '5';
    expect(component.exceedsBalance).toBeFalse();
    expect(component.canSubmit).toBeFalse();
  });

  it('computes the received amount without passing through Number', () => {
    component.tab = 'withdraw';
    component.account = {
      abstractionMode: 'default',
      withdrawableExact: '9007199254740993.000001',
    } as any;
    component.amount = '9007199254740993.000001';

    expect(component.withdrawReceiveExact).toBe('9007199254740992.000001');
  });

  it('reports nothing received when the fee swallows the whole withdrawal', () => {
    component.tab = 'withdraw';
    component.amount = '0.5';

    expect(component.withdrawReceiveExact).toBe('0');
  });

  it('credits a deposit with what the route leaves, not what was sent', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalanceExact = '100';
    component.amount = '50';
    component.depositQuote = { feeExact: '0.2', maxFeeExact: '0.2' };

    expect(component.depositFeeExact).toBe('0.2');
    expect(component.depositReceiveExact).toBe('49.8');
  });

  it('reports the credited amount as unknown until the route is quoted', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalanceExact = '100';
    component.amount = '50';
    component.depositQuote = null;

    expect(component.depositReceiveExact).toBeNull();
  });

  it('blocks deposits for portfolio-margin accounts but never withdrawals', () => {
    component.account = { abstractionMode: 'portfolioMargin' } as any;
    component.accountLoading = false;
    component.walletBalanceExact = '100';
    component.amount = '50';

    expect(component.unsupportedAccountMode).toBeTrue();
    expect(component.canSubmit).toBeFalse();
  });
});

describe('PerpsFundingComponent pre-submit refresh', () => {
  let component: PerpsFundingComponent;
  let hyperliquid: jasmine.SpyObj<any>;
  let writes: jasmine.SpyObj<any>;
  let chrome: jasmine.SpyObj<any>;
  let global: jasmine.SpyObj<any>;
  let evmWallet: jasmine.SpyObj<any>;

  const account = (withdrawableExact: string) => ({
    abstractionMode: 'default',
    withdrawableExact,
  });

  beforeEach(() => {
    hyperliquid = jasmine.createSpyObj(
      'HyperliquidService',
      ['getAccount', 'deposit', 'subscribe', 'watchConnectionState'],
      { depositConfig: { decimals: 6 } }
    );
    hyperliquid.subscribe.and.returnValue(of());
    hyperliquid.watchConnectionState.and.returnValue(of('live'));
    writes = jasmine.createSpyObj('PerpsExchangeWriteService', ['withdraw']);
    writes.withdraw.and.returnValue(of({}));
    chrome = jasmine.createSpyObj('ChromeService', ['getPassword']);
    chrome.getPassword.and.returnValue(Promise.resolve('pw'));
    global = jasmine.createSpyObj('GlobalService', ['snackBarTip']);
    evmWallet = jasmine.createSpyObj('EvmWalletService', ['getPrivateKey']);
    evmWallet.getPrivateKey.and.returnValue(Promise.resolve('0xkey'));

    component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      null,
      global,
      hyperliquid,
      accountStateStub(hyperliquid),
      chrome,
      evmWallet,
      depositChainStub(),
      feeQuoteStub(),
      pendingStub(),
      null,
      writes
    );
    component.tab = 'withdraw';
    component.withdrawQuote = { ...QUOTE };
    // What the confirmation screen was drawn with; `submit` signs only against
    // a quote the user has already been shown.
    component.withdrawConfirmedQuote = { ...QUOTE };
    component.accountLoading = false;
    component.account = account('100') as any;
    (component as any).address = '0xabc';
    (component as any).wallet = { accounts: [{ extra: {} }] };
  });

  it('signs nothing when the pre-submit refresh fails', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(throwError(() => new Error('down')));

    await component.submit();

    expect(component.refreshFailed).toBeTrue();
    expect(component.submitting).toBeFalse();
    expect(chrome.getPassword).not.toHaveBeenCalled();
    expect(writes.withdraw).not.toHaveBeenCalled();
  });

  it('stops instead of quietly shrinking a typed amount when the ceiling moves', async () => {
    component.amount = '100';
    hyperliquid.getAccount.and.returnValue(of(account('87')));

    await component.submit();

    // The number the user typed is still the number on screen — it was not
    // rewritten to something they never asked for.
    expect(component.amount).toBe('100');
    expect(component.balanceMovedUnderInput).toBeTrue();
    expect(component.submitting).toBeFalse();
    expect(writes.withdraw).not.toHaveBeenCalled();
  });

  // Which balance a withdrawal debits is this page's to state: it is already
  // holding the account that answers it, and the write path is told rather
  // than looking it up.
  it('debits spot for a unified account, whose USDC lives there', async () => {
    component.amount = '50';
    // A unified account's withdrawable ceiling comes from spot, not from the
    // perps clearinghouse figure a standard account reports.
    hyperliquid.getAccount.and.returnValue(
      of({
        ...account('100'),
        unified: true,
        spotUsdcExact: '100',
        spotUsdcHoldExact: '0',
      })
    );

    await component.submit();

    expect(writes.withdraw.calls.mostRecent().args[3]).toEqual({
      fromSpot: true,
    });
  });

  it('debits perps for an account that does not report a unified mode', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(of(account('100')));

    await component.submit();

    // The exchange refuses a debit the balance cannot cover, so this is the
    // guess that cannot move money from a balance the user did not mean.
    expect(writes.withdraw.calls.mostRecent().args[3]).toEqual({
      fromSpot: false,
    });
  });

  it('lets a MAX request follow the ceiling down, then asks again', async () => {
    component.setMax();
    expect(component.amount).toBe('100');
    hyperliquid.getAccount.and.returnValue(of(account('87')));

    await component.submit();

    expect(component.amount).toBe('87');
    expect(component.balanceMovedUnderInput).toBeTrue();
    // Following the balance down still does not authorise the send.
    expect(writes.withdraw).not.toHaveBeenCalled();

    await component.submit();
    expect(writes.withdraw).toHaveBeenCalledTimes(1);
  });

  it('proceeds when the refreshed balance still covers the amount', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(of(account('100')));

    await component.submit();

    expect(component.refreshFailed).toBeFalse();
    expect(component.balanceMovedUnderInput).toBeFalse();
    expect(writes.withdraw).toHaveBeenCalledTimes(1);
  });

  // A response that never arrived is not a refusal. Reporting it as a failure
  // is how a user withdraws the same balance twice.
  it('reports a lost withdrawal response as unknown rather than failed', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(of(account('100')));
    writes.withdraw.and.returnValue(
      throwError(() => new PerpsExecutionStatusUnknownError(new Error('socket hang up')))
    );

    await component.submit();

    expect(global.snackBarTip).toHaveBeenCalledWith('perpsWithdrawStatusUnknown');
    expect(global.snackBarTip).not.toHaveBeenCalledWith(
      'txFailed',
      jasmine.anything()
    );
    expect(component.submitting).toBeFalse();
    // Not cleared: nothing here says the withdrawal is done with.
    expect(component.amount).toBe('50');
  });

  it('still calls an exchange refusal a failure', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(of(account('100')));
    writes.withdraw.and.returnValue(
      throwError(() => new Error('Insufficient balance for withdrawal'))
    );

    await component.submit();

    expect(global.snackBarTip).toHaveBeenCalledWith(
      'txFailed',
      'Insufficient balance for withdrawal'
    );
  });

  it('will not sign against a quote the user was never shown', async () => {
    component.amount = '50';
    component.withdrawConfirmedQuote = null;
    hyperliquid.getAccount.and.returnValue(of(account('100')));

    await component.submit();

    expect(writes.withdraw).not.toHaveBeenCalled();
    expect(component.confirming).toBeTrue();
  });

  it('signs a withdrawal the route turned out to price cheaper', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(of(account('100')));
    (component as any).feeQuote.withdrawQuote = () =>
      Promise.resolve({ feeExact: '0.5', maxFeeExact: '0.5' });

    await component.submit();

    // The user is paid more than the confirmation promised. Sending them back
    // to agree to a better number is friction with no question behind it.
    expect(writes.withdraw).toHaveBeenCalled();
    expect(component.confirming).toBeFalse();
  });

  it('asks again when the route got more expensive than the quote shown', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(of(account('100')));
    (component as any).feeQuote.withdrawQuote = () =>
      Promise.resolve({ feeExact: '2', maxFeeExact: '2' });

    await component.submit();

    expect(writes.withdraw).not.toHaveBeenCalled();
    expect(component.confirming).toBeTrue();
  });

  it('drops the refresh warnings as soon as the amount is edited', async () => {
    component.amount = '100';
    hyperliquid.getAccount.and.returnValue(of(account('87')));
    await component.submit();
    expect(component.balanceMovedUnderInput).toBeTrue();

    component.amount = '10';
    component.onAmountChange();

    expect(component.balanceMovedUnderInput).toBeFalse();
    expect(component.refreshFailed).toBeFalse();
  });
});

describe('PerpsFundingComponent submit gate', () => {
  let component: PerpsFundingComponent;

  beforeEach(() => {
    component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      null,
      globalStub(),
      { depositConfig: { decimals: 6 } } as any,
      accountStateStub(),
      null,
      null,
      depositChainStub(),
      feeQuoteStub(),
      pendingStub(),
      null,
      writesStub()
    );
    component.withdrawQuote = { ...QUOTE };
    component.accountLoading = false;
  });

  it('names a reason for every state that disables the control', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = null;
    expect(component.disabledReason).toBe('perpsBalanceUnknown');

    component.walletBalanceExact = '100';
    expect(component.disabledReason).toBe('perpsEnterAmount');

    component.amount = '1';
    expect(component.disabledReason).toBe('perpsBelowMinDeposit');

    component.amount = '500';
    expect(component.disabledReason).toBe('perpsExceedsBalance');

    component.amount = '10.0000001';
    expect(component.disabledReason).toBe('perpsAmountPrecision');

    component.amount = '10';
    expect(component.disabledReason).toBe('');
    expect(component.canSubmit).toBeTrue();
  });

  it('lets a portfolio-margin account withdraw even though it cannot deposit', () => {
    component.account = {
      abstractionMode: 'portfolioMargin',
      withdrawableExact: '100',
    } as any;
    component.walletBalanceExact = '100';
    component.amount = '50';

    expect(component.unsupportedAccountMode).toBeTrue();
    expect(component.disabledReason).toBe('perpsPortfolioMarginNoDeposit');
    expect(component.canSubmit).toBeFalse();

    // Getting money out of an account we cannot model is still the user's right.
    component.tab = 'withdraw';
    expect(component.unsupportedAccountMode).toBeFalse();
    expect(component.canSubmit).toBeTrue();
  });

  it('blocks a deposit whose gas the chain currency cannot cover', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '100';
    component.amount = '50';
    component.networkFeeExact = '0.0002';
    component.nativeBalanceExact = '0.0001';

    expect(component.gasShortfall).toBeTrue();
    expect(component.disabledReason).toBe('perpsGasShortfall');
    expect(component.canSubmit).toBeFalse();

    component.nativeBalanceExact = '0.0002';
    expect(component.gasShortfall).toBeFalse();
    expect(component.canSubmit).toBeTrue();
  });

  it('does not call a shortfall while the fee is still unknown', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '100';
    component.amount = '50';
    component.networkFeeExact = null;
    component.nativeBalanceExact = '0';

    expect(component.gasShortfall).toBeFalse();
  });

  it('shows a deposit for confirmation instead of sending it straight away', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '100';
    component.amount = '50';

    component.requestSubmit();

    expect(component.confirming).toBeTrue();
    expect(component.submitting).toBeFalse();
  });

  // The recipient was never the part in doubt. What the user is agreeing to is a
  // fee read from a contract whose owner can change it.
  it('shows a withdrawal for confirmation rather than sending it on one press', async () => {
    component.tab = 'withdraw';
    component.account = { abstractionMode: 'default', withdrawableExact: '100' } as any;
    component.amount = '50';

    component.requestSubmit();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.confirming).toBeTrue();
    expect(component.submitting).toBeFalse();
    expect(component.withdrawConfirmedQuote).toEqual(QUOTE);
  });

  it('keeps the confirm button down until the withdrawal has a quote to agree to', () => {
    component.tab = 'withdraw';
    component.account = {
      abstractionMode: 'default',
      withdrawableExact: '100',
    } as any;
    component.amount = '50';
    component.withdrawConfirmedQuote = null;
    component.preparingWithdraw = true;

    expect(component.canConfirm).toBeFalse();

    component.preparingWithdraw = false;
    component.withdrawConfirmedQuote = { ...QUOTE };

    expect(component.canConfirm).toBeTrue();
  });

  // Everything `submit` checks, the sheet has to check too: it refuses without
  // a word, so a live-looking confirm button is a button that does nothing.
  it('never offers a confirm button that submitting would refuse', () => {
    component.tab = 'withdraw';
    component.account = {
      abstractionMode: 'default',
      withdrawableExact: '100',
    } as any;
    component.amount = '50';
    component.withdrawConfirmedQuote = { ...QUOTE };
    expect(component.canConfirm).toBeTrue();

    // The fresh quote raised the floor above what the user had already agreed
    // to; the sheet reopens on the new number and must not accept the old one.
    component.amount = '1.5';

    expect(component.belowMinimum).toBeTrue();
    expect(component.canSubmit).toBeFalse();
    expect(component.canConfirm).toBeFalse();
  });

  it('offers percentages of the real balance rather than fixed amounts', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '37.5';

    component.setPercent(50);
    expect(component.amount).toBe('18.75');
    expect(component.exceedsBalance).toBeFalse();
  });
});

/**
 * A deposit's network fee is only known once the confirmation has prepared it,
 * which means the sheet can be the first thing to learn the wallet cannot pay
 * for the send. What the screen does with that is the subject here.
 */
describe('PerpsFundingComponent deposit confirmation', () => {
  let component: PerpsFundingComponent;

  const CONFIG = {
    decimals: 6,
    symbol: 'USDC',
    nativeSymbol: 'ETH',
    chainName: 'Arbitrum Sepolia',
  };

  /** Enough gas for the estimate below, or not — the only variable that matters. */
  function build(nativeBalanceExact: string) {
    const component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      null,
      globalStub(),
      { depositConfig: CONFIG } as any,
      accountStateStub(),
      { getPassword: () => Promise.resolve('password') } as any,
      { getPrivateKey: () => Promise.resolve('0xkey') } as any,
      {
        ...depositChainStub(),
        authorizeDeposit: () =>
          Promise.resolve({ from: '0xabc', amountExact: '50' }),
        depositFeeExact: () => Promise.resolve('0.004'),
      } as any,
      {
        ...feeQuoteStub(),
        depositQuote: () =>
          Promise.resolve({ feeExact: '0.2', maxFeeExact: '0.2' }),
      } as any,
      pendingStub(),
      null,
      writesStub()
    );
    component.tab = 'deposit';
    component.accountLoading = false;
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '100';
    component.nativeBalanceExact = nativeBalanceExact;
    component.amount = '50';
    (component as any).address = '0xabc';
    (component as any).wallet = { accounts: [{ extra: {} }] };
    return component;
  }

  /** Let the whole prepare chain settle; every step of it is a resolved promise. */
  async function settle() {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }

  it('offers the confirm button once the deposit is priced', async () => {
    component = build('1');
    component.requestSubmit();
    await settle();

    expect(component.networkFeeExact).toBe('0.004');
    expect(component.gasShortfall).toBeFalse();
    expect(component.canConfirm).toBeTrue();
  });

  // The network fee is only known after the sheet has already opened and signed
  // an authorisation. Leaving the sheet up would hide the form's reason behind
  // a confirm button that `submit` refuses without a word.
  it('closes the sheet when the fee turns out to be unaffordable', async () => {
    component = build('0.000001');
    expect(component.canSubmit).toBeTrue();

    component.requestSubmit();
    await settle();

    expect(component.confirming).toBeFalse();
    expect(component.networkFeeExact).toBe('0.004');
    expect(component.gasShortfall).toBeTrue();
    expect(component.canSubmit).toBeFalse();
    expect(component.canConfirm).toBeFalse();
  });

  it('says why, on the form, in the currency the fee is actually paid in', async () => {
    component = build('0.000001');
    component.requestSubmit();
    await settle();

    expect(component.disabledReason).toBe('perpsGasShortfall');
    expect(component.disabledReasonParams.symbol).toBe('ETH');
    expect(component.disabledReasonParams.chain).toBe('Arbitrum Sepolia');
  });

  it('drops the unused authorisation rather than leaving it valid after the sheet closes', async () => {
    component = build('0.000001');
    component.requestSubmit();
    await settle();

    expect((component as any).depositAuthorization).toBeNull();
    expect(component.depositQuote).toBeNull();
  });

  it('still forgets the fee when the user backs out of an affordable deposit', async () => {
    component = build('1');
    component.requestSubmit();
    await settle();
    expect(component.networkFeeExact).toBe('0.004');

    component.cancelConfirm();

    expect(component.networkFeeExact).toBeNull();
    expect((component as any).depositAuthorization).toBeNull();
  });

  it('names the token being moved when the reason is about the token', () => {
    component = build('1');
    component.amount = '0.000001';

    expect(component.disabledReason).toBe('perpsBelowMinDeposit');
    expect(component.disabledReasonParams.symbol).toBe('USDC');
  });

  it('drops a prepared deposit when the user leaves the tab', async () => {
    component = build('1');
    component.requestSubmit();
    await settle();
    expect((component as any).depositAuthorization).not.toBeNull();

    component.setTab('withdraw');

    expect(component.confirming).toBeFalse();
    expect((component as any).depositAuthorization).toBeNull();
    expect(component.networkFeeExact).toBeNull();
  });

  it('drops a prepared deposit when the screen is destroyed', async () => {
    component = build('1');
    component.requestSubmit();
    await settle();
    expect((component as any).depositAuthorization).not.toBeNull();

    component.ngOnDestroy();

    expect((component as any).depositAuthorization).toBeNull();
  });
});

/**
 * A failed withdrawal quote used to leave the screen with "please retry" and
 * no control that actually retried. The quote is what the floor, the arrival
 * estimate and the button all depend on, so a miss cannot be a dead end.
 */
describe('PerpsFundingComponent withdrawal quote', () => {
  let component: PerpsFundingComponent;
  let withdrawQuote: jasmine.Spy;

  const CONFIG = {
    decimals: 6,
    symbol: 'USDC',
    nativeSymbol: 'ETH',
    chainName: 'Arbitrum Sepolia',
  };

  beforeEach(() => {
    withdrawQuote = jasmine.createSpy('withdrawQuote');
    component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      null,
      globalStub(),
      { depositConfig: CONFIG, getAccount: () => of({ abstractionMode: 'default', withdrawableExact: '100' }) } as any,
      accountStateStub(),
      null,
      null,
      depositChainStub(),
      {
        ...feeQuoteStub(),
        withdrawQuote: (...args: unknown[]) => withdrawQuote(...args),
      } as any,
      pendingStub(),
      null,
      writesStub()
    );
    component.accountLoading = false;
    component.account = {
      abstractionMode: 'default',
      withdrawableExact: '100',
    } as any;
    (component as any).address = '0xabc';
  });

  async function settle() {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }

  it('lets the user retry a quote that failed to load', async () => {
    withdrawQuote.and.returnValue(Promise.reject(new Error('timeout')));
    component.setTab('withdraw');
    await settle();

    expect(component.withdrawQuote).toBeNull();
    expect(component.disabledReason).toBe('perpsFeeQuoteUnknown');
    expect(component.showRetry).toBeTrue();

    withdrawQuote.and.returnValue(
      Promise.resolve({ feeExact: '0.2', maxFeeExact: '0.2' })
    );
    component.reload();
    await settle();

    expect(component.withdrawQuote).toEqual({
      feeExact: '0.2',
      maxFeeExact: '0.2',
    });
    expect(component.disabledReason).not.toBe('perpsFeeQuoteUnknown');
  });

  it('does not let a slower quote overwrite a newer one', async () => {
    const pending: Array<(value: { feeExact: string; maxFeeExact: string }) => void> =
      [];
    withdrawQuote.and.callFake(
      () =>
        new Promise<{ feeExact: string; maxFeeExact: string }>((resolve) => {
          pending.push(resolve);
        })
    );

    component.setTab('withdraw');
    component.setTab('deposit');
    component.setTab('withdraw');
    expect(pending.length).toBe(2);

    pending[1]({ feeExact: '0.3', maxFeeExact: '0.3' });
    await settle();
    expect(component.withdrawQuote?.feeExact).toBe('0.3');

    pending[0]({ feeExact: '0.1', maxFeeExact: '0.1' });
    await settle();
    expect(component.withdrawQuote?.feeExact).toBe('0.3');
  });

  it('closes the sheet when the confirmation quote cannot be read', async () => {
    withdrawQuote.and.returnValue(Promise.reject(new Error('timeout')));
    component.tab = 'withdraw';
    component.withdrawQuote = { feeExact: '0.2', maxFeeExact: '0.2' };
    component.amount = '50';

    component.requestSubmit();
    await settle();

    expect(component.confirming).toBeFalse();
    expect(component.withdrawQuote).toBeNull();
    expect(component.showRetry).toBeTrue();
  });
});

/**
 * The signed authorisation lets the extension contract pull exactly this
 * deposit, and it stays valid for its whole window whatever happens to the send
 * it was signed for. What the screen still holds afterwards is the subject here.
 */
describe('PerpsFundingComponent deposit authorisation lifetime', () => {
  let component: PerpsFundingComponent;
  let sendDeposit: jasmine.Spy;
  let depositQuote: jasmine.Spy;

  const CONFIG = {
    chainId: 421614,
    decimals: 6,
    symbol: 'USDC',
    nativeSymbol: 'ETH',
    chainName: 'Arbitrum Sepolia',
  };

  const held = () => (component as any).depositAuthorization;

  beforeEach(() => {
    sendDeposit = jasmine.createSpy('sendDeposit').and.returnValue(
      Promise.resolve('0xhash')
    );
    depositQuote = jasmine
      .createSpy('depositQuote')
      .and.returnValue(Promise.resolve({ feeExact: '0.2', maxFeeExact: '0.2' }));
    component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      null,
      globalStub(),
      {
        depositConfig: CONFIG,
        getAccount: () => of({ abstractionMode: 'default' }),
      } as any,
      accountStateStub(),
      { getPassword: () => Promise.resolve('password') } as any,
      { getPrivateKey: () => Promise.resolve('0xkey') } as any,
      {
        ...depositChainStub(),
        tokenBalanceExact: () => Promise.resolve('100'),
        nativeBalanceExact: () => Promise.resolve('1'),
        authorizeDeposit: () =>
          Promise.resolve({ from: '0xabc', amountExact: '50' }),
        depositFeeExact: () => Promise.resolve('0.004'),
        sendDeposit: (...args: unknown[]) => sendDeposit(...args),
      } as any,
      {
        ...feeQuoteStub(),
        depositQuote: (...args: unknown[]) => depositQuote(...args),
      } as any,
      pendingStub(),
      null,
      writesStub()
    );
    component.tab = 'deposit';
    component.accountLoading = false;
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '100';
    component.nativeBalanceExact = '1';
    component.amount = '50';
    (component as any).address = '0xabc';
    (component as any).wallet = { accounts: [{ extra: {} }] };
  });

  async function settle() {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  }

  /** Open the confirmation and let it sign, which is where the permission appears. */
  async function confirmDeposit() {
    component.requestSubmit();
    await settle();
    expect(held()).not.toBeNull();
    await component.submit();
    await settle();
  }

  it('drops the permission once the send has spent it', async () => {
    await confirmDeposit();

    expect(sendDeposit).toHaveBeenCalled();
    // The nonce is consumed on chain, so what would be held here is a
    // permission that can no longer authorise anything.
    expect(held()).toBeNull();
    expect(component.depositQuote).toBeNull();
  });

  it('drops the permission when the send failed, rather than leaving it live', async () => {
    sendDeposit.and.returnValue(Promise.reject(new Error('reverted')));

    await confirmDeposit();

    expect(held()).toBeNull();
    expect(component.submitting).toBeFalse();
  });

  // The exception: the deposit has not been attempted, the sheet is reopening
  // on the same one, and re-signing would only ask again for what was agreed.
  it('keeps the permission when the sheet reopens on a moved quote', async () => {
    component.requestSubmit();
    await settle();
    const signed = held();
    depositQuote.and.returnValue(
      Promise.resolve({ feeExact: '0.9', maxFeeExact: '0.9' })
    );

    await component.submit();
    await settle();

    expect(sendDeposit).not.toHaveBeenCalled();
    expect(component.confirming).toBeTrue();
    expect(held()).toBe(signed);
  });
});
