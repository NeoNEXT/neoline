import BigNumber from 'bignumber.js';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { LoadingComponent } from '@/app/share/components/loading/loading.component';
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
import { PerpsBroadcastStatusUnknownError } from '@/app/core/services/perps/perps-rpc';
import { PerpsFundingComponent } from './perps-funding.component';
import { PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS } from '@popup/_lib/perps';

/**
 * 提现的定价来自报价而不是常量，所以这些测试会写明它们据以计算的那份报价。取 1 USDC 是为了
 * 让算术一目了然；真实数字是合约在当时所说的那个。
 */
const QUOTE = { feeExact: '1' };

/**
 * 这些测试里准备入金总是失败，而且失败会被上报而不是吞掉，所以组件需要一个上报的去处。
 */
const globalStub = () => ({ snackBarTip: () => {} } as any);
/** 这些测试里从不取报价；既不准备也不发送入金。 */
const feeQuoteStub = () =>
  ({
    depositFeeRate: () => Promise.reject(new Error('not stubbed')),
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
      declarations: [PerpsFundingComponent, TranslateStubPipe, LoadingComponent],
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

    expect(balanceLine()).toContain('N/A');
    expect(balanceLine()).not.toContain('$N/A');
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
      null,
      writesStub()
    );
    (component as any).depositFee = { protocolFeeBps: 0, forwardFeeExact: '0.2' };
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
    (component as any).depositFee = { protocolFeeBps: 0, forwardFeeExact: '0.2' };

    expect(component.confirmFeeExact).toBe('0.2');
    expect(component.confirmReceiveExact).toBe('49.8');
  });

  it('reports the credited amount as unknown until the route is quoted', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.accountLoading = false;
    component.walletBalanceExact = '100';
    component.amount = '50';
    (component as any).depositFee = null;

    expect(component.confirmFeeExact).toBeNull();
    expect(component.confirmReceiveExact).toBeNull();
  });

  // 本产品对两种模式采用同一条 USDC 资金路径。这一页因此不认账户模式：
  // 换个模式而其余事实不变，两个 tab 的结论都必须一字不差。
  it('reaches the same verdict for portfolio margin as for a unified account', () => {
    component.accountLoading = false;
    component.walletBalanceExact = '100';
    component.amount = '50';

    const verdicts = (abstractionMode: string) => {
      component.account = {
        abstractionMode,
        unified: true,
        withdrawableExact: '100',
        spotUsdcExact: '100',
        spotUsdcHoldExact: '0',
      } as any;
      return (['deposit', 'withdraw'] as const).map((tab) => {
        component.tab = tab;
        return { reason: component.disabledReason, canSubmit: component.canSubmit };
      });
    };

    expect(verdicts('portfolioMargin')).toEqual(verdicts('unifiedAccount'));
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
      null,
      writes
    );
    (component as any).depositFee = { protocolFeeBps: 0, forwardFeeExact: '0.2' };
    component.tab = 'withdraw';
    component.withdrawQuote = { ...QUOTE };
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

  it('does not withdraw when the refreshed account mode becomes unknown', async () => {
    component.amount = '50';
    hyperliquid.getAccount.and.returnValue(of({ ...account('100'), abstractionMode: 'unknown' }));
    await component.submit();
    expect(component.withdrawableExact).toBeNull();
    expect(component.refreshFailed).toBeTrue();
    expect(writes.withdraw).not.toHaveBeenCalled();
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

  it('does not submit without a loaded withdrawal fee', async () => {
    component.amount = '50';
    component.withdrawQuote = null;
    hyperliquid.getAccount.and.returnValue(of(account('100')));

    await component.submit();

    expect(writes.withdraw).not.toHaveBeenCalled();
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
      null,
      writesStub()
    );
    (component as any).depositFee = { protocolFeeBps: 0, forwardFeeExact: '0.2' };
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

  // 存入曾经因为「我们给这类账户估不准值」被拦下（ADR-0007）。折算既然和统一账户是同一段
  // 代码，那个理由就不成立了，两个方向都得放行。
  it('lets a portfolio-margin account both deposit and withdraw', () => {
    component.account = {
      abstractionMode: 'portfolioMargin',
      unified: true,
      withdrawableExact: '100',
      spotUsdcExact: '100',
      spotUsdcHoldExact: '0',
    } as any;
    component.walletBalanceExact = '100';
    component.amount = '10';

    expect(component.disabledReason).toBe('');
    expect(component.canSubmit).toBeTrue();

    component.tab = 'withdraw';
    expect(component.disabledReason).toBe('');
    expect(component.canSubmit).toBeTrue();
  });

  it('offers percentages of the real balance rather than fixed amounts', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '37.5';

    component.setPercent(50);
    expect(component.amount).toBe('18.75');
    expect(component.exceedsBalance).toBeFalse();
  });

  it('names the wallet ahead of everything else it could also complain about', () => {
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '100';
    component.amount = '10';
    expect(component.disabledReason).toBe('');

    (component as any).wallet = { accounts: [{ extra: { ledgerSLIP44: 60 } }] };
    expect(component.disabledReason).toBe('perpsSigningUnavailable');
    expect(component.canSubmit).toBeFalse();

    // 二维码签名器同理。而且即使同时还有别的可抱怨的（这里是金额空着），先说的仍然是这一条
    // —— 它是这张表上唯一一条用户在这个页面里做什么都解决不了的。
    (component as any).wallet = {
      accounts: [{ extra: { qrBasedXFP: 'abcd1234' } }],
    };
    component.amount = null;
    expect(component.disabledReason).toBe('perpsSigningUnavailable');
  });
});

/**
 * 一笔入金的网络手续费，要等确认页把它准备好之后才知道，这意味着确认面板可能是第一个发现
 * 「钱包付不起这笔发送」的地方。界面为此做什么，就是这里要讲的事。
 */
describe('PerpsFundingComponent page fees', () => {
  let component: PerpsFundingComponent;
  let depositFee: jasmine.Spy;
  let withdrawFee: jasmine.Spy;

  beforeEach(() => {
    depositFee = jasmine.createSpy('depositFeeRate').and.resolveTo(
      { protocolFeeBps: 0, forwardFeeExact: '0.2' }
    );
    withdrawFee = jasmine.createSpy('withdrawQuote').and.resolveTo({ feeExact: '0.3' });
    component = new PerpsFundingComponent(
      { snapshot: { queryParams: {} } } as any,
      { select: () => of({ currentWallet: null }) } as any,
      globalStub(), { depositConfig: { decimals: 6 } } as any,
      accountStateStub(), null, null, depositChainStub(),
      { ...feeQuoteStub(), depositFeeRate: depositFee, withdrawQuote: withdrawFee } as any,
      { watchConnectionState: () => of('live') } as any, writesStub()
    );
  });

  afterEach(() => component.ngOnDestroy());

  it('loads both fees once on entry and reuses them for input, presets and tab switches', fakeAsync(() => {
    depositFee.and.resolveTo({ protocolFeeBps: 1.4, forwardFeeExact: '0.2' });
    component.ngOnInit();
    tick();
    component.amount = '10';
    component.onAmountChange();
    expect(component.confirmFeeExact).toBe('0.2014');
    expect(component.confirmReceiveExact).toBe('9.7986');
    component.amount = '3.33';
    component.onAmountChange();
    expect(component.confirmFeeExact).toBe('0.200467');
    component.walletBalanceExact = '100';
    component.setMax();
    expect(component.confirmReceiveExact).toBe('99.786');
    component.setTab('withdraw');
    component.amount = '20';
    expect(component.confirmFeeExact).toBe('0.3');
    component.setTab('deposit');
    component.reload();
    tick();
    expect(depositFee).toHaveBeenCalledTimes(1);
    expect(withdrawFee).toHaveBeenCalledTimes(1);
  }));

  it('blocks deposits when the entry request fails and retries only the failed fee', fakeAsync(() => {
    depositFee.and.rejectWith(new Error('offline'));
    component.ngOnInit();
    tick();
    component.accountLoading = false;
    component.account = { abstractionMode: 'default' } as any;
    component.walletBalanceExact = '100';
    component.amount = '10';
    expect(component.canSubmit).toBeFalse();
    expect(component.confirmFeeExact).toBeNull();
    expect(component.showRetry).toBeTrue();
    depositFee.and.resolveTo({ protocolFeeBps: 0, forwardFeeExact: '0.2' });
    component.reload();
    tick(400);
    expect(component.confirmReceiveExact).toBe('9.8');
    expect(component.canSubmit).toBeTrue();
    expect(depositFee).toHaveBeenCalledTimes(2);
    expect(withdrawFee).toHaveBeenCalledTimes(1);
  }));

  it('ignores fee responses after leaving the page', fakeAsync(() => {
    let finish: (value: any) => void;
    depositFee.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    component.ngOnInit();
    component.ngOnDestroy();
    finish({ protocolFeeBps: 0, forwardFeeExact: '0.2' });
    tick();
    expect(component.confirmFeeExact).toBeNull();
    expect(component.withdrawQuote).toBeNull();
  }));
});

/** 资金页的手续费、输入锁定和入金确认弹窗渲染。 */
describe('PerpsFundingComponent inline fee display', () => {
  let fixture: ComponentFixture<PerpsFundingComponent>;
  let component: PerpsFundingComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PerpsFundingComponent, TranslateStubPipe, LoadingComponent],
      imports: [FormsModule],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
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
              chainId: 421614,
              cctp: { extension: '0xext' },
            },
            watchConnectionState: () => of('live'),
          },
        },
        { provide: ChromeService, useValue: {} },
        { provide: EvmWalletService, useValue: {} },
        { provide: PerpsDepositChainService, useValue: depositChainStub() },
        { provide: PerpsFeeQuoteService, useValue: feeQuoteStub() },
        { provide: PerpsExchangeWriteService, useValue: writesStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerpsFundingComponent);
    component = fixture.componentInstance;
    component.amount = '50';
  });

  afterEach(() => fixture.destroy());

  it('disables the amount input while submission is pending', async () => {
    component.submitting = true;
    fixture.detectChanges();
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.disabled).toBeTrue();

    component.submitting = false;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.disabled).toBeFalse();
  });

  it('shows a loading indicator on Continue until preparation ends', async () => {
    component.preparingDeposit = true;
    fixture.detectChanges();
    await fixture.whenStable();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.submit-wrap button');
    expect(button.disabled).toBeTrue();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('loading')).not.toBeNull();
    expect(button.textContent.trim()).toBe('');
    expect(fixture.nativeElement.querySelector('.confirm-sheet')).toBeNull();
    component.preparingDeposit = false;
    fixture.detectChanges();
    expect(button.querySelector('loading')).toBeNull();
    expect(button.textContent).toContain('perpsContinue');
  });

  for (const tab of ['deposit', 'withdraw'] as const) {
    it(`shows the ${tab} fee without a tooltip`, () => {
      component.tab = tab;
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.detail-rows tooltip')).toBeNull();
      expect(fixture.nativeElement.querySelector('.confirm-sheet')).toBeNull();
    });
  }

});

describe('PerpsFundingComponent single submission', () => {
  let component: PerpsFundingComponent;
  let chain: jasmine.SpyObj<any>;
  let chrome: jasmine.SpyObj<any>;
  let wallet: jasmine.SpyObj<any>;
  let writes: jasmine.SpyObj<any>;
  let states: any;
  let accountStore: BehaviorSubject<any>;
  const address = '0xabc';
  const config = { chainId: 421614, decimals: 6, nativeSymbol: 'ETH', chainName: 'Arbitrum Sepolia' };
  const account = { abstractionMode: 'disabled', unified: false, withdrawableExact: '100' };
  const settle = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); } };

  beforeEach(() => {
    chain = jasmine.createSpyObj('chain', ['tokenBalanceExact', 'nativeBalanceExact', 'authorizeDeposit',
      'sendDeposit', 'depositOutcome', 'depositFeeExact']);
    chain.tokenBalanceExact.and.resolveTo('100');
    chain.nativeBalanceExact.and.resolveTo('1');
    chain.authorizeDeposit.and.resolveTo({ from: address, amountExact: '10' });
    chain.sendDeposit.and.resolveTo('0xhash');
    chain.depositOutcome.and.resolveTo('confirmed');
    chain.depositFeeExact.and.resolveTo('0.00012');
    chrome = jasmine.createSpyObj('chrome', ['getPassword']);
    chrome.getPassword.and.resolveTo('pw');
    wallet = jasmine.createSpyObj('wallet', ['getPrivateKey']);
    wallet.getPrivateKey.and.resolveTo('0xkey');
    writes = jasmine.createSpyObj('writes', ['withdraw']);
    writes.withdraw.and.returnValue(of({}));
    states = {
      refreshAccount: jasmine.createSpy('refresh').and.returnValue(of({ account })),
      watchAccount: () => of({ account, availability: 'live' }),
    };
    accountStore = new BehaviorSubject({ currentWallet: { accounts: [{ address, extra: {} }] } });
    component = new PerpsFundingComponent({ snapshot: { queryParams: {} } } as any,
      { select: () => accountStore } as any,
      globalStub(), { depositConfig: config } as any, states, chrome, wallet, chain,
      feeQuoteStub(), { watchConnectionState: () => of('live') } as any, writes);
    Object.assign(component, { address, wallet: accountStore.value.currentWallet, account,
      accountLoading: false, walletBalanceExact: '100', nativeBalanceExact: '1', amount: '10',
      withdrawQuote: { feeExact: '0.2' }, depositFee: { protocolFeeBps: 0, forwardFeeExact: '0.2' } });
  });

  afterEach(() => component.ngOnDestroy());

  it('keeps confirmation closed until preparation finishes', async () => {
    let finish: (balance: string) => void;
    chain.tokenBalanceExact.and.returnValue(new Promise(resolve => finish = resolve));
    const pending = component.submitFunding();
    expect(component.confirming).toBeFalse();
    expect(component.preparingDeposit).toBeTrue();
    expect(component.canConfirm).toBeFalse();
    await component.submit();
    expect(chain.sendDeposit).not.toHaveBeenCalled();
    finish('100');
    await pending;
    expect(component.confirming).toBeTrue();
    expect(component.preparingDeposit).toBeFalse();
    expect(component.canConfirm).toBeTrue();
  });

  it('authorizes for estimation before confirmation and reauthorizes before sending', async () => {
    const order: string[] = [];
    chain.tokenBalanceExact.and.callFake(async () => { order.push('USDC'); return '100'; });
    chain.nativeBalanceExact.and.callFake(async () => { order.push('ETH'); return '1'; });
    wallet.getPrivateKey.and.callFake(async () => { order.push('key'); return '0xkey'; });
    chain.authorizeDeposit.and.callFake(async () => { order.push('auth'); return { from: address, amountExact: '10' }; });
    chain.sendDeposit.and.callFake(async () => { order.push('send'); return '0xhash'; });
    await component.submitFunding();
    expect(order).toEqual(['USDC', 'ETH', 'key', 'auth']);
    expect(component.confirming).toBeTrue();
    expect(component.networkFeeExact).toBe('0.00012');
    expect(chain.sendDeposit).not.toHaveBeenCalled();
    expect(wallet.getPrivateKey).toHaveBeenCalledTimes(1);
    await component.submit();
    expect(chain.depositFeeExact).toHaveBeenCalledTimes(1);
    expect(chain.authorizeDeposit).toHaveBeenCalledTimes(2);
    expect(order.slice(0, 9)).toEqual(['USDC', 'ETH', 'key', 'auth', 'USDC', 'ETH', 'key', 'auth', 'send']);
    expect(wallet.getPrivateKey).toHaveBeenCalledTimes(2);
    expect(chain.depositOutcome).toHaveBeenCalledOnceWith(config, '0xhash', PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS);
  });

  it('reduces a MAX draft and waits for another click without unlocking', async () => {
    component.setMax();
    chain.tokenBalanceExact.and.resolveTo('80');
    await component.submitFunding();
    expect(component.amount).toBe('80');
    expect(component.balanceMovedUnderInput).toBeTrue();
    expect(wallet.getPrivateKey).not.toHaveBeenCalled();
    expect(chain.authorizeDeposit).not.toHaveBeenCalled();
  });

  for (const balance of ['tokenBalanceExact', 'nativeBalanceExact']) {
    it(`stops before unlocking when ${balance} cannot be refreshed`, async () => {
      chain[balance].and.rejectWith(new Error('offline'));
      await component.submitFunding();
      expect(component.refreshFailed).toBeTrue();
      expect(wallet.getPrivateKey).not.toHaveBeenCalled();
    });
  }

  it('retains the ETH shortfall reason from the real transaction budget', async () => {
    chain.nativeBalanceExact.and.resolveTo('0');
    await component.submitFunding();
    expect(component.disabledReason).toBe('perpsGasShortfall');
    expect(component.amount).toBe('10');
    expect(chain.depositOutcome).not.toHaveBeenCalled();
  });

  for (const change of ['wallet', 'amount', 'destroy']) {
    it(`does not withdraw when ${change} changes during key decryption`, async () => {
      if (change === 'wallet') { component.ngOnInit(); }
      component.tab = 'withdraw';
      let finish: (value: string) => void;
      wallet.getPrivateKey.and.returnValue(new Promise<string>(resolve => finish = resolve));
      const pending = component.submitFunding();
      await settle();
      if (change === 'wallet') { accountStore.next({ currentWallet: { accounts: [{ address: '0xdef' }] } }); }
      if (change === 'amount') { component.amount = '20'; component.onAmountChange(); }
      if (change === 'destroy') { component.ngOnDestroy(); }
      finish('0xkey');
      await pending;
      expect(writes.withdraw).not.toHaveBeenCalled();
    });
  }

  it('blocks repeat clicks through refresh and decryption', async () => {
    component.tab = 'withdraw';
    await Promise.all([component.submitFunding(), component.submitFunding()]);
    expect(wallet.getPrivateKey).toHaveBeenCalledTimes(1);
    expect(writes.withdraw).toHaveBeenCalledTimes(1);
  });

  it('tracks the original hash after an ambiguous broadcast without sending again', async () => {
    chain.sendDeposit.and.rejectWith(new PerpsBroadcastStatusUnknownError('0xhash', new Error('response lost')));
    await component.submitFunding();
    await component.submit();
    expect(chain.sendDeposit).toHaveBeenCalledTimes(1);
    expect(chain.depositOutcome).toHaveBeenCalledOnceWith(config, '0xhash', PERPS_DEPOSIT_RECEIPT_TIMEOUT_MS);
    expect(component.amount).toBeNull();
  });

  it('does not sign or estimate while the amount is being edited', () => {
    component.onAmountChange();
    expect(wallet.getPrivateKey).not.toHaveBeenCalled();
    expect(chain.authorizeDeposit).not.toHaveBeenCalled();
    expect(chain.depositFeeExact).not.toHaveBeenCalled();
  });

  it('cannot bypass deposit confirmation by calling submit directly', async () => {
    await component.submit();
    expect(wallet.getPrivateKey).not.toHaveBeenCalled();
    expect(chain.sendDeposit).not.toHaveBeenCalled();
  });

  it('discards a cancelled authorization and stops gas refresh until preparing a new draft', fakeAsync(() => {
    void component.submitFunding();
    tick();
    component.cancelConfirm();
    tick(60000);
    expect(component.confirming).toBeFalse();
    expect(component.networkFeeExact).toBeNull();
    expect(chain.depositFeeExact).toHaveBeenCalledTimes(1);
    void component.submit();
    tick();
    expect(chain.sendDeposit).not.toHaveBeenCalled();
    void component.submitFunding();
    tick();
    expect(chain.authorizeDeposit).toHaveBeenCalledTimes(2);
    expect(component.canConfirm).toBeTrue();
    tick(30000);
    expect(chain.depositFeeExact).toHaveBeenCalledTimes(3);
    component.ngOnDestroy();
  }));

  it('refreshes the network fee every 30 seconds and sends with a new authorization and the confirmed route fee', fakeAsync(() => {
    chain.authorizeDeposit.and.resolveTo({ from: address, amountExact: '10', nonce: 'estimate',
      validBefore: Math.floor(Date.now() / 1000) + 60 });
    void component.submitFunding();
    tick();
    const authorization = chain.depositFeeExact.calls.first().args[1];
    chain.depositFeeExact.and.resolveTo('0.00024');
    (component as any).depositFee = { protocolFeeBps: 0, forwardFeeExact: '0.8' };
    component.nativeBalanceExact = '0.0002';
    tick(29999);
    expect(chain.depositFeeExact).toHaveBeenCalledTimes(1);
    tick(1);
    expect(chain.depositFeeExact).toHaveBeenCalledTimes(2);
    expect(chain.depositFeeExact.calls.mostRecent().args).toEqual([config, authorization, '0.2']);
    expect(component.networkFeeExact).toBe('0.00024');
    expect(component.gasShortfall).toBeTrue();
    expect(component.canConfirm).toBeFalse();
    chain.depositFeeExact.and.resolveTo('0.00018');
    tick(30000);
    expect(component.networkFeeExact).toBe('0.00018');
    expect(component.canConfirm).toBeTrue();
    expect(component.confirmFeeExact).toBe('0.2');
    expect(component.confirmReceiveExact).toBe('9.8');
    expect(authorization.validBefore).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    const freshAuthorization = { ...authorization, nonce: 'send', validBefore: Math.floor(Date.now() / 1000) + 1800 };
    chain.authorizeDeposit.and.resolveTo(freshAuthorization);
    void component.submit();
    tick();
    expect(chain.sendDeposit).toHaveBeenCalledOnceWith(config, '0xkey', freshAuthorization, '0.2');
    expect(chain.authorizeDeposit).toHaveBeenCalledTimes(2);
    expect(wallet.getPrivateKey).toHaveBeenCalledTimes(2);
    tick(60000);
    expect(chain.depositFeeExact).toHaveBeenCalledTimes(3);
  }));

  it('rechecks ETH before decrypting the key for the final transaction', async () => {
    await component.submitFunding();
    chain.nativeBalanceExact.and.resolveTo('0.000119999999999999');
    await component.submit();
    expect(component.disabledReason).toBe('perpsGasShortfall');
    expect(component.confirming).toBeFalse();
    expect(wallet.getPrivateKey).toHaveBeenCalledTimes(1);
    expect(chain.sendDeposit).not.toHaveBeenCalled();
  });

  it('accepts an ETH balance equal to the confirmed network fee', async () => {
    await component.submitFunding();
    chain.nativeBalanceExact.and.resolveTo('0.00012');
    await component.submit();
    expect(chain.sendDeposit).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh preparation after a gas estimate failure and closes confirmation if refreshing fails', fakeAsync(() => {
    chain.depositFeeExact.and.rejectWith(new Error('offline'));
    void component.submitFunding();
    tick();
    expect(component.confirming).toBeFalse();
    expect(component.canSubmit).toBeTrue();
    expect(chain.sendDeposit).not.toHaveBeenCalled();
    chain.depositFeeExact.and.resolveTo('0.00012');
    void component.submitFunding();
    tick();
    expect(component.canConfirm).toBeTrue();
    chain.depositFeeExact.and.rejectWith(new Error('offline'));
    tick(30000);
    expect(component.confirming).toBeFalse();
    expect(component.networkFeeExact).toBeNull();
    expect(component.preparingDeposit).toBeFalse();
    expect(component.canSubmit).toBeTrue();
    tick(60000);
    expect(chain.depositFeeExact).toHaveBeenCalledTimes(3);
  }));

  for (const change of ['amount', 'tab', 'destroy', 'cancel']) {
    it(`ignores a periodic gas estimate that finishes after ${change} changes`, fakeAsync(() => {
      void component.submitFunding();
      tick();
      let finish: (value: any) => void;
      chain.depositFeeExact.and.returnValue(new Promise(resolve => finish = resolve));
      tick(30000);
      expect(component.preparingDeposit).toBeTrue();
      expect(component.canConfirm).toBeFalse();
      void component.submit();
      tick(30000);
      expect(chain.depositFeeExact).toHaveBeenCalledTimes(2);
      if (change === 'amount') { component.amount = '20'; component.onAmountChange(); }
      if (change === 'tab') { component.setTab('withdraw'); }
      if (change === 'destroy') { component.ngOnDestroy(); }
      if (change === 'cancel') { component.cancelConfirm(); }
      finish('0.0009');
      tick();
      expect(component.confirming).toBeFalse();
      expect(component.networkFeeExact).toBeNull();
      expect(chain.sendDeposit).not.toHaveBeenCalled();
      tick(60000);
      expect(chain.depositFeeExact).toHaveBeenCalledTimes(2);
    }));
  }
});
