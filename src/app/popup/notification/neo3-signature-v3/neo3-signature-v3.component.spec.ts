import { of } from 'rxjs';
import { wallet } from '@cityofzion/neon-core-neo3';
import { NEP21ErrorCode } from '@cross-runtime/neo-dapi-error';
import { PopupNoticeNeo3SignV3Component } from './neo3-signature-v3.component';

describe('PopupNoticeNeo3SignV3Component signer selection', () => {
  const currentScriptHash = '22'.repeat(20);
  const requestedScriptHash = '11'.repeat(20);
  const currentWallet = {
    accounts: [
      { address: wallet.getAddressFromScriptHash(currentScriptHash) },
    ],
  };
  const requestedWallet = {
    accounts: [
      { address: wallet.getAddressFromScriptHash(requestedScriptHash) },
    ],
  };

  function createComponent(wallets = [currentWallet]) {
    const chrome = {
      windowCallback: jasmine.createSpy('windowCallback'),
    };
    const store = {
      select: () =>
        of({
          currentChainType: 'Neo3',
          currentWallet,
          n3Networks: [{ magicNumber: 894710606 }],
          n3NetworkIndex: 0,
          neo3WIFArr: [],
          neo3WalletArr: wallets,
        }),
    };
    const component = new PopupNoticeNeo3SignV3Component(
      {} as any,
      chrome as any,
      {} as any,
      store as any,
    );
    return { component, chrome };
  }

  it('uses the explicitly requested wallet when it exists', () => {
    const { component } = createComponent([currentWallet, requestedWallet]);
    component.params = {
      message: 'hello',
      account: requestedScriptHash,
      options: {},
    };

    (component as any).resolveSignerWallet();

    expect(component.signerWallet).toBe(requestedWallet as any);
    expect(component.address).toBe(requestedWallet.accounts[0].address);
  });

  it('does not fall back to the current wallet when the account is missing', () => {
    const { component, chrome } = createComponent();
    component.params = {
      message: 'hello',
      account: requestedScriptHash,
      options: {},
    };

    (component as any).resolveSignerWallet();
    component.signature();

    expect(component.signerWallet).toBeUndefined();
    expect(component.address).toBeUndefined();
    expect(chrome.windowCallback).toHaveBeenCalledWith(
      jasmine.objectContaining({
        error: jasmine.objectContaining({ code: NEP21ErrorCode.NOTFOUND }),
      }),
      true,
    );
  });
});
