import { BehaviorSubject } from 'rxjs';

import { PopupAccountComponent } from './account.component';

describe('PopupAccountComponent', () => {
  it('keeps the displayed wallet stable while its removal triggers navigation', () => {
    const removedWallet = {
      name: 'removed',
      accounts: [
        {
          address: '0x0000000000000000000000000000000000000001',
          extra: {},
        },
      ],
    };
    const remainingWallet = {
      name: 'remaining',
      accounts: [
        {
          address: '0x0000000000000000000000000000000000000002',
          extra: {},
        },
      ],
    };
    const account$ = new BehaviorSubject({
      currentWallet: removedWallet,
      currentChainType: 'NeoX',
      neo2WIFArr: [],
      neo3WIFArr: [],
      neo2WalletArr: [],
      neo3WalletArr: [],
      neoXWalletArr: [removedWallet, remainingWallet],
    });
    const queryParams$ = new BehaviorSubject({
      address: removedWallet.accounts[0].address,
      chainType: 'NeoX',
    });
    const component = new PopupAccountComponent(
      {} as any,
      {} as any,
      {} as any,
      { queryParams: queryParams$ } as any,
      {} as any,
      { select: () => account$ } as any,
      {} as any
    );

    account$.next({
      ...account$.value,
      currentWallet: remainingWallet,
      neoXWalletArr: [remainingWallet],
    });

    expect(component.operateWallet).toBe(removedWallet as any);
    component.ngOnDestroy();
  });
});
