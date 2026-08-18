import { of, throwError } from 'rxjs';

import { PerpsFundingComponent } from './perps-funding.component';

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

/** The deposit chain is never reached in these tests; only withdrawals run. */
const depositChainStub = () =>
  ({
    tokenBalanceExact: () => Promise.reject(new Error('not stubbed')),
    nativeBalanceExact: () => Promise.reject(new Error('not stubbed')),
    transferFeeExact: () => Promise.reject(new Error('not stubbed')),
    sendDeposit: () => Promise.reject(new Error('not stubbed')),
    isConfirmed: () => Promise.resolve(false),
  } as any);

describe('PerpsFundingComponent amount boundaries', () => {
  let component: PerpsFundingComponent;

  beforeEach(() => {
    component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      null,
      null,
      { depositConfig: { decimals: 6 } } as any,
      null,
      null,
      depositChainStub(),
      pendingStub()
    );
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

  it('uses the Hyperliquid wire precision for withdrawals', () => {
    component.tab = 'withdraw';
    component.amount = '2.00000001';

    expect(component.amountDecimals).toBe(8);
    expect(component.amountExceedsPrecision).toBeFalse();

    component.amount = '2.000000001';
    expect(component.amountExceedsPrecision).toBeTrue();
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

  it('floors withdraw MAX to the wire precision instead of offering a rejected amount', () => {
    component.tab = 'withdraw';
    // The exchange reports withdrawable with more decimals than it accepts.
    component.account = {
      abstractionMode: 'default',
      withdrawableExact: '12.3456789012345',
    } as any;
    component.accountLoading = false;

    component.setMax();

    expect(component.amount).toBe('12.3456789');
    expect(component.amountExceedsPrecision).toBeFalse();
    expect(component.exceedsBalance).toBeFalse();
    expect(component.canSubmit).toBeTrue();
  });

  it('draws the withdrawal ceiling from withdrawable, not the tradable balance', () => {
    component.tab = 'withdraw';
    // A unified account folds free spot USDC into availableBalance; spot cannot
    // be withdrawn through the perps action, so it must not raise the ceiling.
    component.account = {
      abstractionMode: 'unifiedAccount',
      withdrawableExact: '40',
      availableBalanceExact: '140',
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

    expect(component.receiveAmountExact).toBe('9007199254740992.000001');
  });

  it('reports nothing received when the fee swallows the whole withdrawal', () => {
    component.tab = 'withdraw';
    component.amount = '0.5';

    expect(component.receiveAmountExact).toBe('0');
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
      ['getAccount', 'withdraw', 'deposit', 'subscribe', 'watchConnectionState'],
      { depositConfig: { decimals: 6 } }
    );
    hyperliquid.subscribe.and.returnValue(of());
    hyperliquid.watchConnectionState.and.returnValue(of('live'));
    hyperliquid.withdraw.and.returnValue(of({}));
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
      chrome,
      evmWallet,
      depositChainStub(),
      pendingStub()
    );
    component.tab = 'withdraw';
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
    expect(hyperliquid.withdraw).not.toHaveBeenCalled();
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
    expect(hyperliquid.withdraw).not.toHaveBeenCalled();
  });

  it('lets a MAX request follow the ceiling down, then asks again', async () => {
    component.setMax();
    expect(component.amount).toBe('100');
    hyperliquid.getAccount.and.returnValue(of(account('87')));

    await component.submit();

    expect(component.amount).toBe('87');
    expect(component.balanceMovedUnderInput).toBeTrue();
    // Following the balance down still does not authorise the send.
    expect(hyperliquid.withdraw).not.toHaveBeenCalled();

    await component.submit();
    expect(hyperliquid.withdraw).toHaveBeenCalledTimes(1);
  });

  it('proceeds when the refreshed balance still covers the amount', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(of(account('100')));

    await component.submit();

    expect(component.refreshFailed).toBeFalse();
    expect(component.balanceMovedUnderInput).toBeFalse();
    expect(hyperliquid.withdraw).toHaveBeenCalledTimes(1);
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
      null,
      { depositConfig: { decimals: 6 } } as any,
      null,
      null,
      depositChainStub(),
      pendingStub()
    );
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

  it('offers percentages of the real balance rather than fixed amounts', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '37.5';

    component.setPercent(50);
    expect(component.amount).toBe('18.75');
    expect(component.exceedsBalance).toBeFalse();
  });
});
