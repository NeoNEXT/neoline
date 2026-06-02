import { BehaviorSubject } from 'rxjs';
import { ethers } from 'ethers';
import { EvmWalletService } from './wallet.service';

describe('EvmWalletService', () => {
  const phrase =
    'test test test test test test test test test test test junk';
  const password = '12345678';
  let service: EvmWalletService;

  beforeEach(() => {
    const accountState$ = new BehaviorSubject<any>({
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
  });
});
