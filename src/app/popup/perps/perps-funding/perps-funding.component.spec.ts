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
 * 提现的定价来自报价而不是常量，所以这些测试会写明它们据以计算的那份报价。取 1 USDC 是为了
 * 让算术一目了然；真实数字是合约在当时所说的那个。
 */
const QUOTE = { feeExact: '1', maxFeeExact: '1' };

/** 这些测试不发送任何入金，因此永远不会记录待入账记录。 */
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
 * 这些测试里准备入金总是失败，而且失败会被上报而不是吞掉，所以组件需要一个上报的去处。
 */
const globalStub = () => ({ snackBarTip: () => {} } as any);

/** 这些测试里从不取报价；既不准备也不发送入金。 */
const feeQuoteStub = () =>
  ({
    depositQuote: () => Promise.reject(new Error('not stubbed')),
    withdrawQuote: () => Promise.resolve({ ...QUOTE }),
    minWithdrawExact: (quote: { feeExact: string }) =>
      new BigNumber(quote.feeExact).times(2).toFixed(),
  } as any);

/** 这些测试里从不触及入金链；只跑提现。 */
const depositChainStub = () =>
  ({
    tokenBalanceExact: () => Promise.reject(new Error('not stubbed')),
    nativeBalanceExact: () => Promise.reject(new Error('not stubbed')),
    authorizeDeposit: () => Promise.reject(new Error('not stubbed')),
    depositFeeExact: () => Promise.reject(new Error('not stubbed')),
    sendDeposit: () => Promise.reject(new Error('not stubbed')),
    depositOutcome: () => Promise.resolve('pending'),
  } as any);

/** 让直接构造保持聚焦在页面本身，同时保留它的账户接缝。 */
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
 * 渲染测试 —— 本文件其余部分替代不了它们。
 *
 * 上面那些全都用 `new` 构造组件并断言它的 getter。这就给模板留下了读别的东西的空间 ——
 * 而它真的这么干过：余额那一行读的是 `account.withdrawableExact`（原始协议字段，统一账户下
 * 为 0），而不是它旁边同名的那个 getter，于是一个有资金的账户被显示成 $0.00，而周围每个
 * getter 都是对的。正因如此，这些测试断言的是渲染出来的文本。
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
        // store 里没有钱包，所以什么都不会加载，被测的账户永远只是每个用例自己设的那个。
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

  /** 金额输入框下面那一行：这个数字唯一的显示位置。 */
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

  // 交易场所会签八位小数，但提现最终是以目的链上的 USDC 交付的，
  // 而那边只有六位。
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
    // 交易场所报出的可提余额，其小数位数多于最终付款的那个代币所能承载的。
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
    // 无论统一账户有多少资金，永续清算所都报 0，所以在这里读它，会把一个有资金的账户显示成
    // $0，并挡下它能做的每一笔提现。它的 hold 是被占用的抵押品，不是可提余额。
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
    // 标准账户把现货和永续当作两个独立钱包：那笔现货 USDC 在被划转之前一直搁浅，
    // 也不能从这个页面出去。
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
    // 没有可供给出的数额，所以什么都不填 —— 而对着一个未知余额输入的金额，
    // 也不能被称作「超出余额」。
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
    // 确认页当初是用它画出来的；`submit` 只会对用户已经看过的报价签名。
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

    // 用户输入的数字仍然是屏幕上的那个数字 —— 它没有被改写成一个
    // 他们从未要过的值。
    expect(component.amount).toBe('100');
    expect(component.balanceMovedUnderInput).toBeTrue();
    expect(component.submitting).toBeFalse();
    expect(writes.withdraw).not.toHaveBeenCalled();
  });

  // 提现从哪个余额扣款由本页面说了算：它手上本来就握着能回答这个问题的账户，
  // 而写入路径是被告知的，不是自己去查的。
  it('debits spot for a unified account, whose USDC lives there', async () => {
    component.amount = '50';
    // 统一账户的可提上限来自现货，而不是标准账户所上报的
    // 永续清算所那个数字。
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

    // 交易场所会拒绝余额不足以覆盖的扣款，所以这个猜测不可能
    // 从用户没打算动的余额里挪走钱。
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
    // 跟着余额一起往下走，仍然不构成对这笔转账的授权。
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

  // 从未到达的响应不是拒绝。把它报告成失败，
  // 正是用户把同一笔余额提两次的方式。
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
    // 不清空：这里没有任何东西说明这笔提现已经了结。
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

    // 用户拿到的比确认页承诺的更多。把他们送回去同意一个更好的数字，
    // 是没有任何问题作为依据的摩擦。
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

    // 就算账户我们建不了模，把钱取出来仍然是用户的权利。
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

  // 收款方从来不是有疑问的那一部分。用户要同意的，是一笔从合约里读来的、
  // 而其 owner 可以修改的手续费。
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

  // `submit` 检查的每一项，这个确认面板都得跟着检查：它拒绝时一声不吭，
  // 所以一个看起来能按的确认按钮，就是一个按了没反应的按钮。
  it('never offers a confirm button that submitting would refuse', () => {
    component.tab = 'withdraw';
    component.account = {
      abstractionMode: 'default',
      withdrawableExact: '100',
    } as any;
    component.amount = '50';
    component.withdrawConfirmedQuote = { ...QUOTE };
    expect(component.canConfirm).toBeTrue();

    // 新报价把下限抬到了用户已经同意的数额之上；
    // 面板会以新数字重新打开，并且绝不能接受旧的那个。
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
 * 一笔入金的网络手续费，要等确认页把它准备好之后才知道，这意味着确认面板可能是第一个发现
 * 「钱包付不起这笔发送」的地方。界面为此做什么，就是这里要讲的事。
 */
describe('PerpsFundingComponent deposit confirmation', () => {
  let component: PerpsFundingComponent;

  const CONFIG = {
    decimals: 6,
    symbol: 'USDC',
    nativeSymbol: 'ETH',
    chainName: 'Arbitrum Sepolia',
  };

  /** 够不够付下面那笔估算的 gas —— 这是唯一要紧的变量。 */
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

  /** 让整条准备链跑完；它的每一步都是一个已 resolve 的 promise。 */
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

  // 网络手续费要等确认面板已经打开、并且已经签过一次授权之后才知道。把面板留着不关，
  // 会把表单给出的原因藏在一个 `submit` 一声不吭就拒绝的确认按钮后面。
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
 * 提现报价失败过去会在界面上留下一句「请重试」，却没有任何真的能重试的控件。下限、到账估算
 * 和按钮全都依赖这份报价，所以一次失手不能是死胡同。
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
 * 那份已签名的授权，准许扩展合约恰好取走这一笔入金；无论它所对应的那次发送发生了什么，
 * 它在自己的有效窗口内始终有效。这之后界面还留着什么，就是这里要讲的事。
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

  /** 打开确认面板并让它签名 —— 授权就是在那里出现的。 */
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
    // nonce 已经在链上被消耗掉了，所以此时若还留着它，
    // 留下的是一份再也授权不了任何东西的许可。
    expect(held()).toBeNull();
    expect(component.depositQuote).toBeNull();
  });

  it('drops the permission when the send failed, rather than leaving it live', async () => {
    sendDeposit.and.returnValue(Promise.reject(new Error('reverted')));

    await confirmDeposit();

    expect(held()).toBeNull();
    expect(component.submitting).toBeFalse();
  });

  // 例外情形：这笔入金还没有被尝试过，面板是就着同一笔重新打开的，
  // 重新签名也只是把已经同意过的东西再要一次。
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
