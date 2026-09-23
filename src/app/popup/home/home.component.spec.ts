import { Subject } from 'rxjs';
import { PopupHomeComponent } from './home.component';

describe('PopupHomeComponent', () => {
  const account = (chainType: string) => ({
    currentChainType: chainType,
    currentWallet: { accounts: [{ address: '0x1' }] },
    n3Networks: [{}],
    n3NetworkIndex: 0,
    neoXNetworks: [{}],
    neoXNetworkIndex: 0,
    neo3WalletArr: [],
    neo2WalletArr: [],
    neoXWalletArr: [],
  });

  const component = () => {
    const account$ = new Subject<any>();
    const value = new PopupHomeComponent(
      { navigate: () => Promise.resolve(true) } as any,
      { snapshot: { queryParams: {} } } as any,
      null,
      null,
      { select: () => account$ } as any
    );
    return { value, account$ };
  };

  it('keeps the open tab when the account store stays on NeoX', () => {
    const { value, account$ } = component();
    value.selectedTabType = 'perpetual';

    account$.next(account('NeoX'));

    expect(value.selectedTabType).toBe('perpetual');
  });

  it('returns to the assets tab when the account store is not NeoX', () => {
    const { value, account$ } = component();
    value.selectedTabType = 'perpetual';

    account$.next(account('Neo3'));

    expect(value.selectedTabType).toBe('asset');
  });

  it('reopens perps from the url when the account is NeoX', () => {
    const account$ = new Subject<any>();
    const value = new PopupHomeComponent(
      { navigate: () => Promise.resolve(true) } as any,
      { snapshot: { queryParams: { tab: 'perps' } } } as any,
      { rateCurrencySub: new Subject() } as any,
      null,
      { select: () => account$ } as any
    );
    account$.next(account('NeoX'));
    spyOn(value, 'showPerps');
    (globalThis as any).chrome = {};

    value.ngOnInit();

    expect(value.showPerps).toHaveBeenCalled();
  });

  it('does not reopen perps from the url for a non-NeoX account', () => {
    const account$ = new Subject<any>();
    const value = new PopupHomeComponent(
      { navigate: () => Promise.resolve(true) } as any,
      { snapshot: { queryParams: { tab: 'perps' } } } as any,
      { rateCurrencySub: new Subject() } as any,
      null,
      { select: () => account$ } as any
    );
    account$.next(account('Neo3'));
    (globalThis as any).chrome = {};

    value.ngOnInit();

    expect(value.selectedTabType).toBe('asset');
  });
});
