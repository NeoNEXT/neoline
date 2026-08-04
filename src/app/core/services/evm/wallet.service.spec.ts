import { BehaviorSubject } from 'rxjs';
import { ethers } from 'ethers';
import { EvmWalletService } from './wallet.service';

describe('EvmWalletService', () => {
  const phrase =
    'test test test test test test test test test test test junk';
  const password = '12345678';
  let service: EvmWalletService;
  let accountState$: BehaviorSubject<any>;

  beforeEach(() => {
    accountState$ = new BehaviorSubject<any>({
      neoXWalletArr: [],
    });
    const store = jasmine.createSpyObj('Store', ['select']);
    store.select.and.returnValue(accountState$.asObservable());

    service = new EvmWalletService(store);
  });

  it('imports NeoX mnemonic wallets in lightweight HD shape', async () => {
    const wallet = await service.importWalletFromPhrase(phrase, password);
    const extra = wallet.accounts[0].extra;

    expect(Object.keys(wallet)).toEqual(['name', 'accounts']);
    expect(wallet.name).toBe('account 1');
    // 已知答案向量：该助记词在 m/44'/60'/0'/0/0 上的地址（anvil/hardhat 账户 0），可独立验证
    expect(wallet.accounts[0].address).toBe(
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    );
    expect(extra.isHDWallet).toBeTrue();
    expect(extra.hdWalletId).toBe('Wallet 1');
    expect(extra.hdWalletIndex).toBe(0);
    expect(extra.encryptedJson).toBeTruthy();
    expect(extra.publicKey).toBeTruthy();
    expect('isHdCreateWallet' in extra).toBeFalse();
    // 导入是恢复流程，应标记为已备份（回归防护）
    expect(extra.hasBackup).toBeTrue();
  });

  it('derives private keys from lightweight NeoX HD wallets', async () => {
    const wallet = await service.importWalletFromPhrase(phrase, password);
    const privateKey = await service.getPrivateKey(wallet, password);

    expect(new ethers.Wallet(privateKey).address).toBe(
      wallet.accounts[0].address
    );
  });

  it('derives the next NeoX HD account from the lightweight carrier', async () => {
    const wallet = await service.importWalletFromPhrase(phrase, password);
    const nextWallet = await service.deriveNextWallet(wallet, password);

    expect(Object.keys(nextWallet)).toEqual(['name', 'accounts']);
    expect(nextWallet.name).toBe('account 2');
    expect(nextWallet.accounts[0].address).not.toBe(
      wallet.accounts[0].address
    );
    expect(nextWallet.accounts[0].extra.hdWalletId).toBe(
      wallet.accounts[0].extra.hdWalletId
    );
    expect(nextWallet.accounts[0].extra.hdWalletIndex).toBe(1);
    expect(nextWallet.accounts[0].extra.encryptedJson).toBe(
      wallet.accounts[0].extra.encryptedJson
    );
    expect('isHdCreateWallet' in nextWallet.accounts[0].extra).toBeFalse();
  });

  it('creates a separate group from imports, then derives the created group', async () => {
    const importedWallet = await service.importWalletFromPhrase(
      phrase,
      password
    );
    accountState$.next({ neoXWalletArr: [importedWallet] });

    const createdWallet = await service.createWallet(
      password,
      'Created account'
    );

    expect(createdWallet.accounts[0].extra.hdWalletId).toBe('Wallet 2');
    expect(createdWallet.accounts[0].extra.hdWalletIndex).toBe(0);
    expect(createdWallet.accounts[0].extra.isHdCreateWallet).toBeTrue();
    expect(createdWallet.accounts[0].extra.encryptedJson).not.toBe(
      importedWallet.accounts[0].extra.encryptedJson
    );

    accountState$.next({
      neoXWalletArr: [importedWallet, createdWallet],
    });
    const nextCreatedWallet = await service.createWallet(
      password,
      'Created account 2'
    );

    expect(nextCreatedWallet.accounts[0].extra.hdWalletId).toBe('Wallet 2');
    expect(nextCreatedWallet.accounts[0].extra.hdWalletIndex).toBe(1);
    expect(nextCreatedWallet.accounts[0].extra.isHdCreateWallet).toBeTrue();
    expect(nextCreatedWallet.accounts[0].extra.encryptedJson).toBe(
      createdWallet.accounts[0].extra.encryptedJson
    );
  });

  it('ignores an unmarked legacy HD wallet and then derives the marked group', async () => {
    const legacyCreatedWallet = await service.createWallet(
      password,
      'Legacy created account'
    );
    delete legacyCreatedWallet.accounts[0].extra.isHdCreateWallet;
    accountState$.next({ neoXWalletArr: [legacyCreatedWallet] });

    const markedWallet = await service.createWallet(
      password,
      'Marked account'
    );

    expect(markedWallet.accounts[0].extra.hdWalletId).toBe('Wallet 2');
    expect(markedWallet.accounts[0].extra.hdWalletIndex).toBe(0);
    expect(markedWallet.accounts[0].extra.isHdCreateWallet).toBeTrue();
    expect(markedWallet.accounts[0].extra.encryptedJson).not.toBe(
      legacyCreatedWallet.accounts[0].extra.encryptedJson
    );

    accountState$.next({
      neoXWalletArr: [legacyCreatedWallet, markedWallet],
    });
    const nextWallet = await service.createWallet(password, 'Next account');

    expect(nextWallet.accounts[0].extra.hdWalletId).toBe('Wallet 2');
    expect(nextWallet.accounts[0].extra.hdWalletIndex).toBe(1);
    expect(nextWallet.accounts[0].extra.encryptedJson).toBe(
      markedWallet.accounts[0].extra.encryptedJson
    );
  });
});
