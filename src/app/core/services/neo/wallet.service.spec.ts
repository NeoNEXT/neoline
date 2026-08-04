import { BehaviorSubject } from 'rxjs';
import { NeoHdWalletToolService } from './neo-hd-wallet-tool.service';
import { NeoWalletService } from './wallet.service';

describe('NeoWalletService mnemonic creation', () => {
  const phrase =
    'test test test test test test test test test test test junk';
  const password = '12345678';

  function createService(
    neo3WalletArr: any[],
    selectedChainType: 'Neo2' | 'Neo3' | 'NeoX' = 'Neo3'
  ) {
    const accountState$ = new BehaviorSubject<any>({
      neo2WalletArr: [],
      neo3WalletArr,
      neoXWalletArr: [],
    });
    const store = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    store.select.and.returnValue(accountState$.asObservable());
    const hdWalletTool = new NeoHdWalletToolService();
    const service = new NeoWalletService(
      {} as any,
      {} as any,
      { selectedChainType } as any,
      hdWalletTool,
      store
    );
    return { service, hdWalletTool };
  }

  it('creates a new mnemonic wallet when Neo N3 has no mnemonic wallet', async () => {
    const { service } = createService([]);

    const wallet = await service.createWallet(password, 'My account');

    expect(wallet.name).toBe('My account');
    expect(wallet.accounts[0].extra.isHDWallet).toBeTrue();
    expect(wallet.accounts[0].extra.hdWalletId).toBe('Wallet 1');
    expect(wallet.accounts[0].extra.hdWalletIndex).toBe(0);
    expect(wallet.accounts[0].extra.hasBackup).toBeFalse();
  });

  it('does not derive from an imported Neo N3 mnemonic wallet', async () => {
    const { hdWalletTool } = createService([]);
    const importedWallet = await hdWalletTool.getFirstWalletFromPhrase(
      phrase,
      password
    );
    const { service } = createService([importedWallet]);

    const wallet = await service.createWallet(password, 'Created account');

    expect(wallet.name).toBe('Created account');
    expect(wallet.accounts[0].extra.hdWalletId).toBe('Wallet 2');
    expect(wallet.accounts[0].extra.hdWalletIndex).toBe(0);
    expect(wallet.accounts[0].extra.isHdCreateWallet).toBeTrue();
    expect(wallet.accounts[0].extra.encryptedJson).not.toBe(
      importedWallet.accounts[0].extra.encryptedJson
    );
  });

  it('derives the next index from an existing created Neo N3 wallet', async () => {
    const { hdWalletTool } = createService([]);
    const firstWallet = await hdWalletTool.createWallet(
      password,
      'First account'
    );
    const secondWallet = await hdWalletTool.deriveNextWallet(
      firstWallet,
      password
    );
    const { service: serviceWithWallets } = createService([
      firstWallet,
      secondWallet,
    ]);

    const wallet = await serviceWithWallets.createWallet(
      password,
      'My third account'
    );

    expect(wallet.name).toBe('My third account');
    expect(wallet.accounts[0].extra.hdWalletId).toBe('Wallet 1');
    expect(wallet.accounts[0].extra.hdWalletIndex).toBe(2);
    expect(wallet.accounts[0].extra.encryptedJson).toBe(
      firstWallet.accounts[0].extra.encryptedJson
    );
    expect(wallet.accounts[0].extra.isHdCreateWallet).toBeTrue();
  });

  it('ignores an unmarked legacy HD wallet when creating the marked group', async () => {
    const { hdWalletTool } = createService([]);
    const legacyCreatedWallet = await hdWalletTool.createWallet(
      password,
      'Legacy created account'
    );
    delete legacyCreatedWallet.accounts[0].extra.isHdCreateWallet;
    const { service } = createService([legacyCreatedWallet]);

    const wallet = await service.createWallet(password, 'Second account');

    expect(wallet.accounts[0].extra.hdWalletId).toBe('Wallet 2');
    expect(wallet.accounts[0].extra.hdWalletIndex).toBe(0);
    expect(wallet.accounts[0].extra.isHdCreateWallet).toBeTrue();
    expect(wallet.accounts[0].extra.encryptedJson).not.toBe(
      legacyCreatedWallet.accounts[0].extra.encryptedJson
    );
  });

});
