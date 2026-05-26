import { handleWallet, parseUrl } from './app';

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

  it('groups HD wallets by hdWalletId and numbers only HD groups', () => {
    const privateWallet = wallet('private', 'Nprivate');
    const hdWalletA0 = wallet('account 1', 'NA0', {
      isHDWallet: true,
      hdWalletId: 'group-a',
      hdWalletIndex: 0,
    });
    const ledgerWallet = wallet('ledger', 'Nledger', {
      ledgerSLIP44: '888',
    });
    const hdWalletB0 = wallet('account 1', 'NB0', {
      isHDWallet: true,
      hdWalletId: 'group-b',
      hdWalletIndex: 0,
    });
    const hdWalletA1 = wallet('account 2', 'NA1', {
      isHDWallet: true,
      hdWalletId: 'group-a',
      hdWalletIndex: 1,
    });

    const result = handleWallet(
      [privateWallet, hdWalletA0, ledgerWallet, hdWalletB0, hdWalletA1],
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
    expect(result[1].hdWalletId).toBe('group-a');
    expect(result[1].walletArr).toEqual([hdWalletA0, hdWalletA1]);
    expect(result[2].isHDWalletGroup).toBeTrue();
    expect(result[2].hdWalletId).toBe('group-b');
    expect(result[2].walletArr).toEqual([hdWalletB0]);
    expect(result[3].walletArr).toEqual([ledgerWallet]);
  });
});
