import { NeoHdWalletToolService } from './neo-hd-wallet-tool.service';

describe('NeoHdWalletToolService', () => {
  const phrase =
    'test test test test test test test test test test test junk';
  const password = '12345678';

  let service: NeoHdWalletToolService;

  beforeEach(() => {
    service = new NeoHdWalletToolService();
  });

  it('creates the first N3 account with HD metadata', async () => {
    const wallet = await service.getFirstWalletFromPhrase(phrase, password);
    const extra = wallet.accounts[0].extra;

    expect(wallet.name).toBe('account 1');
    expect(extra.isHDWallet).toBeTrue();
    expect(extra.hdWalletId).toBeTruthy();
    expect(extra.hdWalletIndex).toBe(0);
    expect(extra.encryptedJson).toBeTruthy();
    expect(extra.publicKey).toBe(wallet.accounts[0].publicKey);
  });

  it('derives the next N3 account from the same mnemonic carrier', async () => {
    const firstWallet = await service.getFirstWalletFromPhrase(
      phrase,
      password
    );
    const nextWallet = await service.deriveNextWallet(firstWallet, password);

    expect(nextWallet.name).toBe('account 2');
    expect(nextWallet.accounts[0].address).not.toBe(
      firstWallet.accounts[0].address
    );
    expect(nextWallet.accounts[0].extra.hdWalletId).toBe(
      firstWallet.accounts[0].extra.hdWalletId
    );
    expect(nextWallet.accounts[0].extra.hdWalletIndex).toBe(1);
    expect(nextWallet.accounts[0].extra.encryptedJson).toBe(
      firstWallet.accounts[0].extra.encryptedJson
    );
  });
});
