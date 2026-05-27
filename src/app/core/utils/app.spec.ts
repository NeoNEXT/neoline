import { getNextHDWalletId, handleWallet, parseUrl } from './app';

describe('parseUrl', () => {
  it('should parse simple query parameters correctly', () => {
    const result = parseUrl('https://example.com?name=John&age=30');
    expect(result).toEqual({ name: 'John', age: '30' });
  });

  it('should decode URL-encoded values', () => {
    const result = parseUrl('https://example.com?city=New%20York&note=Hello%20World%21');
    expect(result).toEqual({ city: 'New York', note: 'Hello World!' });
  });

  it('should handle URLs without query parameters', () => {
    const result = parseUrl('https://example.com');
    expect(result).toEqual({});
  });

  it('should handle query string starting with "?" only', () => {
    const result = parseUrl('?a=1&b=2');
    expect(result).toEqual({ a: '1', b: '2' });
  });

  it('should handle empty values', () => {
    const result = parseUrl('https://example.com?key=');
    expect(result).toEqual({ key: '' });
  });

  it('should handle multiple "=" in a value', () => {
    const result = parseUrl('https://example.com?token=a=b=c');
    expect(result).toEqual({ token: 'a=b=c' });
  });
});

describe('handleWallet', () => {
  function wallet(name: string, address: string, extra: any = {}) {
    return {
      name,
      accounts: [{ address, extra }],
    } as any;
  }

  it('groups HD wallets by hdWalletId and sorts them by wallet and account index', () => {
    const privateWallet = wallet('private', 'Nprivate');
    const hdWalletA0 = wallet('account 1', 'NA0', {
      isHDWallet: true,
      hdWalletId: 'Wallet 1',
      hdWalletIndex: 0,
    });
    const ledgerWallet = wallet('ledger', 'Nledger', {
      ledgerSLIP44: '888',
    });
    const hdWalletB0 = wallet('account 1', 'NB0', {
      isHDWallet: true,
      hdWalletId: 'Wallet 2',
      hdWalletIndex: 0,
    });
    const hdWalletA1 = wallet('account 2', 'NA1', {
      isHDWallet: true,
      hdWalletId: 'Wallet 1',
      hdWalletIndex: 1,
    });

    const result = handleWallet(
      [privateWallet, hdWalletB0, hdWalletA1, ledgerWallet, hdWalletA0],
      'Neo3'
    );

    expect(result.map((item) => item.title)).toEqual([
      'Private key',
      'Wallet 1',
      'Wallet 2',
      'Ledger',
      'OneKey',
    ]);
    expect(result[0].walletArr).toEqual([privateWallet]);
    expect(result[1].isHDWalletGroup).toBeTrue();
    expect(result[1].hdWalletId).toBe('Wallet 1');
    expect(result[1].walletArr).toEqual([hdWalletA0, hdWalletA1]);
    expect(result[2].isHDWalletGroup).toBeTrue();
    expect(result[2].hdWalletId).toBe('Wallet 2');
    expect(result[2].walletArr).toEqual([hdWalletB0]);
    expect(result[3].walletArr).toEqual([ledgerWallet]);
  });

  it('creates the next HD wallet id from the current maximum Wallet index', () => {
    const privateWallet = wallet('private', 'Nprivate');
    const hdWalletA = wallet('account 1', 'NA0', {
      isHDWallet: true,
      hdWalletId: 'Wallet 1',
      hdWalletIndex: 0,
    });
    const hdWalletC = wallet('account 1', 'NC0', {
      isHDWallet: true,
      hdWalletId: 'Wallet 3',
      hdWalletIndex: 0,
    });

    expect(getNextHDWalletId([privateWallet, hdWalletA, hdWalletC])).toBe(
      'Wallet 4'
    );
  });
});
