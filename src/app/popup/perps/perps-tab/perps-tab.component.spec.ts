import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { aggregatePerpsAccounts, parsePerpsAccount } from '@app/core/services/perps/perps-account-state';
import { PerpsTabComponent } from './perps-tab.component';
import { ethMarket } from '../perps.test-fixture';

// 行的顺序、排序、翻页和搜索现在都在 PerpsMarketListComponent 里，
// 由这个 tab 内嵌；它们的 spec 也跟着搬过去了。
describe('PerpsTabComponent', () => {
  const component = () => new PerpsTabComponent(null, null, null, null, null, null, null, null);

  it('locates a position market by key so HIP-3 namesakes stay apart', () => {
    const value = component();
    const canonical = ethMarket({ key: 'hl:IWM', coin: 'IWM', symbol: 'IWM' });
    const hip3 = ethMarket({
      key: 'neol:IWM',
      dex: 'neol',
      coin: 'neol:IWM',
      symbol: 'IWM',
      szDecimals: 2,
    });
    // 由内嵌的市场列表提供，而不是 tab 自己的数据源。
    value.markets = [canonical, hip3];

    expect(
      value.marketFor({ key: 'neol:IWM', symbol: 'IWM' } as any)
    ).toBe(hip3);
  });

  // 本产品对两种模式展示同一套 USDC 金额，不代表完整组合估值。这一页因此不认账户模式：
  // 权益、可用余额和出入金入口都照常，不再有一条只对 portfolioMargin 生效的分支。
  it('values a portfolio-margin account exactly like a unified one', () => {
    const value = component();
    const state = {
      totalBalanceExact: '1250.5',
      availableBalanceExact: '900.25',
      positions: [{ key: 'hl:ETH', symbol: 'ETH' }],
      missingDexes: [],
    };
    value.accountAvailability = 'live' as any;

    value.account = { ...state, abstractionMode: 'unifiedAccount' } as any;
    const unified = {
      equity: value.accountEquityExact,
      available: value.availableMarginExact,
      actionsDisabled: value.globalActionsDisabled,
    };

    value.account = { ...state, abstractionMode: 'portfolioMargin' } as any;

    expect(value.accountEquityExact).toBe(unified.equity);
    expect(value.availableMarginExact).toBe(unified.available);
    expect(value.globalActionsDisabled).toBe(unified.actionsDisabled);
    expect(value.globalActionsDisabled).toBeFalse();
    expect(value.hasPositions).toBeTrue();
  });

  it('does not present an unknown account total as zero', () => {
    const value = component();
    value.account = {
      abstractionMode: 'disabled',
      totalBalanceExact: null,
      availableBalanceExact: null,
      positions: [],
    } as any;

    expect(value.accountEquityExact).toBeNull();
    expect(value.availableMarginExact).toBeNull();
    expect(value.hasEquity).toBeFalse();
  });

  it('keeps account-wide actions disabled while aggregation is loading', () => {
    const value = component();
    value.account = {
      abstractionMode: 'disabled',
      missingDexes: [],
      positions: [],
    } as any;
    value.accountAvailability = 'loading';

    expect(value.globalActionsDisabled).toBeTrue();
  });

  it('quotes a position market price from the mid, then the mark', () => {
    const value = component();
    const position = { key: 'hl:ETH' } as any;

    value.markets = [ethMarket({ midPxExact: '101.5', markPxExact: '100' })];
    expect(value.positionMarketPrice(position)).toBe('101.5');
    expect(value.usingMidPrice(position)).toBeTrue();

    value.markets = [ethMarket({ midPxExact: null, markPxExact: '100' })];
    expect(value.positionMarketPrice(position)).toBe('100');
    expect(value.usingMidPrice(position)).toBeFalse();

    value.markets = [ethMarket({ midPxExact: null, markPxExact: '0' })];
    expect(value.positionMarketPrice(position)).toBeNull();
  });
});

describe('PerpsTabComponent account initialization', () => {
  let component: PerpsTabComponent;
  let wallets: BehaviorSubject<any>;
  let accounts: BehaviorSubject<any>;
  let chrome: jasmine.SpyObj<any>;
  let walletService: jasmine.SpyObj<any>;
  let writes: jasmine.SpyObj<any>;

  beforeEach(() => {
    wallets = new BehaviorSubject({ currentWallet: { accounts: [{ address: '0xabc', extra: {} }] } });
    accounts = new BehaviorSubject({ availability: 'live', account: { abstractionMode: 'default' } });
    chrome = jasmine.createSpyObj('ChromeService', ['getPassword']);
    chrome.getPassword.and.resolveTo('password');
    walletService = jasmine.createSpyObj('EvmWalletService', ['getPrivateKey']);
    walletService.getPrivateKey.and.resolveTo('private-key');
    writes = jasmine.createSpyObj('PerpsExchangeWriteService', ['ensureUnifiedAccount'], { unifiedAccountEnabled: true });
    writes.ensureUnifiedAccount.and.returnValue(of('unifiedAccount'));
    component = new PerpsTabComponent(null, { select: () => wallets } as any,
      { watchMarkets: () => of({ markets: [], updatedAt: null }) } as any,
      { watchAggregatedAccount: () => accounts } as any,
      { watchConnectionState: () => of('live') } as any,
      chrome, walletService, writes);
  });

  afterEach(() => component.ngOnDestroy());

  it('initializes default through the existing software-wallet session without a submit click', fakeAsync(() => {
    accounts.next({ availability: 'live', account: { abstractionMode: 'default' } });
    component.ngOnInit();
    flushMicrotasks();
    expect(walletService.getPrivateKey).toHaveBeenCalledOnceWith(wallets.value.currentWallet, 'password');
    expect(writes.ensureUnifiedAccount).toHaveBeenCalledOnceWith('private-key');
    wallets.next({ ...wallets.value });
    flushMicrotasks();
    expect(writes.ensureUnifiedAccount).toHaveBeenCalledTimes(1);
  }));

  for (const mode of ['disabled', 'unifiedAccount', 'portfolioMargin', 'unknown', 'dexAbstraction']) {
    it(`does not unlock or migrate ${mode} during initialization`, fakeAsync(() => {
      accounts.next({ availability: 'live', account: { abstractionMode: mode } });
      component.ngOnInit();
      flushMicrotasks();
      expect(chrome.getPassword).not.toHaveBeenCalled();
      expect(walletService.getPrivateKey).not.toHaveBeenCalled();
      expect(writes.ensureUnifiedAccount).not.toHaveBeenCalled();
    }));
  }

  it('does not unlock when the migration feature is disabled', fakeAsync(() => {
    (Object.getOwnPropertyDescriptor(writes, 'unifiedAccountEnabled').get as jasmine.Spy).and.returnValue(false);
    component.ngOnInit();
    flushMicrotasks();
    expect(chrome.getPassword).not.toHaveBeenCalled();
    expect(writes.ensureUnifiedAccount).not.toHaveBeenCalled();
  }));

  for (const extra of [{ ledgerSLIP44: 60 }, { qrBasedXFP: 'fingerprint' }]) {
    it(`does not request hardware signing during initialization: ${JSON.stringify(extra)}`, fakeAsync(() => {
      wallets.next({ currentWallet: { accounts: [{ address: '0xabc', extra }] } });
      component.ngOnInit();
      flushMicrotasks();
      expect(chrome.getPassword).not.toHaveBeenCalled();
      expect(walletService.getPrivateKey).not.toHaveBeenCalled();
      expect(writes.ensureUnifiedAccount).not.toHaveBeenCalled();
    }));
  }

  it('does not decrypt or migrate without an existing unlocked session', fakeAsync(() => {
    chrome.getPassword.and.resolveTo(undefined);
    component.ngOnInit();
    flushMicrotasks();
    expect(walletService.getPrivateKey).not.toHaveBeenCalled();
    expect(writes.ensureUnifiedAccount).not.toHaveBeenCalled();
  }));

  it('waits for the standard DEX account mode when HIP-3 returns first', fakeAsync(() => {
    accounts.next({ availability: 'loading', account: null });
    component.ngOnInit();
    flushMicrotasks();
    expect(chrome.getPassword).not.toHaveBeenCalled();
    const hip3 = parsePerpsAccount(null, undefined, 'disabled', 'xyz');
    accounts.next({ availability: 'loading', account: aggregatePerpsAccounts([hip3]) });
    flushMicrotasks();
    expect(chrome.getPassword).not.toHaveBeenCalled();
    const standard = parsePerpsAccount(null, { balances: [] }, 'default');
    accounts.next({ availability: 'live', account: aggregatePerpsAccounts([standard, hip3]) });
    flushMicrotasks();
    expect(writes.ensureUnifiedAccount).toHaveBeenCalledOnceWith('private-key');
  }));

  it('ignores the old private key when the selected wallet changes during decryption', fakeAsync(() => {
    let oldKey: (value: string) => void;
    walletService.getPrivateKey.and.callFake((wallet) => wallet.accounts[0].address === '0xabc'
      ? new Promise<string>((resolve) => oldKey = resolve)
      : Promise.resolve('new-private-key'));
    component.ngOnInit();
    flushMicrotasks();
    wallets.next({ currentWallet: { accounts: [{ address: '0xdef', extra: {} }] } });
    flushMicrotasks();
    oldKey('old-private-key');
    flushMicrotasks();
    expect(writes.ensureUnifiedAccount).toHaveBeenCalledOnceWith('new-private-key');
  }));

  it('does not dispatch a migration after leaving Perps during decryption', fakeAsync(() => {
    let finish: (value: string) => void;
    walletService.getPrivateKey.and.returnValue(new Promise<string>((resolve) => finish = resolve));
    component.ngOnInit();
    flushMicrotasks();
    component.ngOnDestroy();
    finish('private-key');
    flushMicrotasks();
    expect(writes.ensureUnifiedAccount).not.toHaveBeenCalled();
  }));

  it('keeps the account readable when initialization migration fails', fakeAsync(() => {
    writes.ensureUnifiedAccount.and.returnValue(throwError(() => new Error('offline')));
    component.ngOnInit();
    flushMicrotasks();
    expect(component.account).toBe(accounts.value.account);
    expect(component.accountAvailability).toBe('live');
    expect(component.accountLoadError).toBeFalse();
  }));
});
