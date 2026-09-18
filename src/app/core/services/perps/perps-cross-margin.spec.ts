import { crossMarginAccount } from './perps-cross-margin';

const state = (equity = '100', maintenance = '5', positions: any[] = []) => ({
  crossMarginSummary: { accountValue: equity },
  crossMaintenanceMarginUsed: maintenance,
  assetPositions: positions.map((position) => ({ position })),
});
const position = (coin: string, type: string, marginUsed = '0') => ({
  coin, szi: '1', positionValue: '100', marginUsed, leverage: { type },
});

describe('crossMarginAccount', () => {
  it('uses only the selected DEX cross equity in standard accounts', () => {
    const result = crossMarginAccount('default', '', [
      ['', state('116', '9', [position('ETH', 'cross'), position('BTC', 'isolated', '20')])],
      ['xyz', state('1000', '200')],
    ], { balances: [{ token: 0, total: '9000' }] });
    expect(result).toEqual({
      equityExact: '116', maintenanceMarginExact: '9',
      positions: [{ coin: 'ETH', sziExact: '1', positionValueExact: '100' }],
    });
  });

  it('keeps locked cross initial margin in unified equity and excludes isolated equity', () => {
    const result = crossMarginAccount('unifiedAccount', '', [
      ['', state('0', '9', [position('ETH', 'cross')])],
      ['outside-product', state('0', '3', [position('outside-product:BTC', 'cross'), position('outside-product:X', 'isolated', '20')])],
      ['other-token', state('0', '200', [position('other-token:ETH', 'cross'), position('other-token:X', 'isolated', '500')])],
    ], { balances: [{ token: 0, total: '136.03', hold: '76.02' }, { token: 1, total: '9000' }] },
    { '': 0, 'outside-product': 0, 'other-token': 1 });
    expect(result.equityExact).toBe('116.03');
    expect(result.maintenanceMarginExact).toBe('12');
    expect(result.positions.map((p) => p.coin)).toEqual(['ETH', 'outside-product:BTC']);
  });

  it('does not turn missing risk data or unsupported account modes into zero risk', () => {
    for (const mode of ['unknown', 'portfolioMargin', 'dexAbstraction'] as const) {
      expect(crossMarginAccount(mode, '', [['', state()]], null)).toBeNull();
    }
    expect(crossMarginAccount('default', '', [['', state(undefined, 'NaN')]], null)).toBeNull();
    expect(crossMarginAccount('default', '', [['xyz', state()]], null)).toBeNull();
    expect(crossMarginAccount('unifiedAccount', '', [['', state()]], null, { '': 0 })).toBeNull();
    expect(crossMarginAccount('unifiedAccount', '', [
      ['', state('0', '0')], ['unknown-dex', state('0', '2', [position('unknown-dex:X', 'cross')])],
    ], { balances: [{ token: 0, total: '100' }] }, { '': 0 })).toBeNull();
  });
});
