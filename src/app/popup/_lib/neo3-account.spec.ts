import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { Wallet3 } from './neo3-account';

describe('Wallet3 account metadata', () => {
  const ledgerExtra = {
    ledgerAddressIndex: 0,
    ledgerSLIP44: '80000378_next',
    device: 'Ledger' as const,
  };

  function createLedgerAccountLike() {
    const source = new wallet3.Account();
    const accountLike = new wallet3.Account(source.publicKey).export();
    accountLike.extra = {
      ...ledgerExtra,
      publicKey: source.publicKey,
    };
    return accountLike;
  }

  it('preserves Ledger metadata when adding an account', () => {
    const wallet = new Wallet3({ name: 'Neo3 Ledger' });

    wallet.addAccount(createLedgerAccountLike());

    expect(wallet.accounts[0].extra).toEqual(
      jasmine.objectContaining({
        ledgerAddressIndex: 0,
        ledgerSLIP44: '80000378_next',
        device: 'Ledger',
      })
    );
  });

  it('preserves Ledger metadata when restoring an exported wallet', () => {
    const source = new Wallet3({ name: 'Neo3 Ledger' });
    source.addAccount(createLedgerAccountLike());

    const restored = new Wallet3(source.export());

    expect(restored.accounts[0].extra).toEqual(
      jasmine.objectContaining({
        ledgerAddressIndex: 0,
        ledgerSLIP44: '80000378_next',
        device: 'Ledger',
      })
    );
  });
});
