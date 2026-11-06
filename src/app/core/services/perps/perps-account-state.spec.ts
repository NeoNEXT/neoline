import {
  aggregatePerpsAccounts,
  parsePerpsAccount,
  updatePerpsAccountFromClearinghouseState,
  updatePerpsAccountFromSpotState,
} from './perps-account-state';
import { PerpsAccountMode } from '@popup/_lib/perps';

const clearinghouse = {
  marginSummary: { accountValue: '120', totalMarginUsed: '20', totalNtlPos: '100' },
  crossMarginSummary: { accountValue: '100', totalMarginUsed: '20' },
  withdrawable: '90',
  crossMaintenanceMarginUsed: '5',
  assetPositions: [{ position: { coin: 'ETH', szi: '1' } }],
};
const spot = { balances: [{ coin: 'USDC', token: 0, total: '1000', hold: '40' }] };

describe('Perps account mode balances', () => {
  it('reads transferable spot HYPE without adding its value to USDC equity', () => {
    const value = parsePerpsAccount(clearinghouse, { balances: [
      ...spot.balances, { coin: 'HYPE', total: '1000', hold: '900', spotHold: '999.9998' },
    ] }, 'portfolioMargin');
    expect(value.spotHypeAvailableExact).toBe('0.0002');
    expect(value.totalBalanceExact).toBe('1000');
    expect(value.availableBalanceExact).toBe('960');
  });

  it('updates spot HYPE from spot frames and preserves it across perps frames', () => {
    const initial = parsePerpsAccount(clearinghouse, spot, 'disabled');
    const updated = updatePerpsAccountFromSpotState(initial, { spotState: { balances: [
      ...spot.balances, { coin: 'HYPE', total: '1.23456789', hold: '0.2' },
    ] } });
    expect(updated.spotHypeAvailableExact).toBe('1.03456789');
    const afterPerps = updatePerpsAccountFromClearinghouseState(updated, clearinghouse);
    expect(afterPerps.spotHypeAvailableExact).toBe('1.03456789');
  });

  it('distinguishes absent HYPE from an unread spot balance and clamps locked HYPE to zero', () => {
    expect(parsePerpsAccount(clearinghouse, spot, 'disabled').spotHypeAvailableExact).toBe('0');
    expect(parsePerpsAccount(clearinghouse, null, 'disabled').spotHypeAvailableExact).toBeNull();
    expect(parsePerpsAccount(clearinghouse, { balances: [{
      coin: 'HYPE', total: '1', hold: 'bad',
    }] }, 'disabled').spotHypeAvailableExact).toBeNull();
    expect(parsePerpsAccount(clearinghouse, { balances: [{
      coin: 'HYPE', total: '1', hold: '2',
    }] }, 'disabled').spotHypeAvailableExact).toBe('0');
  });

  it('preserves unknown amounts through updates and aggregation without losing positions', () => {
    const initial = parsePerpsAccount(clearinghouse, spot, 'unknown');
    const afterSpot = updatePerpsAccountFromSpotState(initial, spot);
    const afterPerps = updatePerpsAccountFromClearinghouseState(afterSpot, clearinghouse);
    const aggregate = aggregatePerpsAccounts([afterPerps]);
    for (const value of [initial, afterSpot, afterPerps, aggregate]) {
      expect(value.totalBalanceExact).toBeNull();
      expect(value.accountValueExact).toBeNull();
      expect(value.availableBalanceExact).toBeNull();
      expect(value.withdrawableExact).toBeNull();
      expect(value.positions.length).toBe(1);
    }
  });

  it('does not turn a missing unknown-mode clearinghouse into zero', () => {
    const value = parsePerpsAccount(null, spot, 'unknown');
    expect(value.totalBalanceExact).toBeNull();
    expect(value.availableBalanceExact).toBeNull();
    expect(value.withdrawableExact).toBeNull();
  });

  ['default', 'disabled', 'dexAbstraction'].forEach((mode: PerpsAccountMode) => {
    it(`keeps spot separate from reported DEX balances for ${mode}`, () => {
      const value = parsePerpsAccount(clearinghouse, spot, mode);
      expect(value.totalBalanceExact).toBe('120');
      expect(value.availableBalanceExact).toBe('80');
      expect(value.withdrawableExact).toBe('90');
      expect(value.spotUsdcExact).toBe('1000');
      const updated = updatePerpsAccountFromSpotState(value, {
        balances: [{ coin: 'USDC', total: '2000', hold: '0' }],
      });
      expect(updated.availableBalanceExact).toBe('80');
    });
  });

  it('matches the audited standard balance without using its lower withdrawal allowance', () => {
    const value = parsePerpsAccount({
      ...clearinghouse,
      marginSummary: { accountValue: '2061035.1356250001', totalMarginUsed: '263047.171393' },
      crossMarginSummary: { accountValue: '2061035.1356250001', totalMarginUsed: '263047.171393' },
      withdrawable: '1742487.9543920001',
    }, spot, 'disabled');
    expect(value.availableBalanceExact).toBe('1797987.9642320001');
    expect(value.withdrawableExact).toBe('1742487.9543920001');
  });

  it('recomputes cross availability from perps frames and sums each DEX independently', () => {
    const initial = parsePerpsAccount(clearinghouse, spot, 'disabled');
    const updated = updatePerpsAccountFromClearinghouseState(initial, {
      clearinghouseState: {
        ...clearinghouse,
        marginSummary: { accountValue: '300', totalMarginUsed: '100' },
        crossMarginSummary: { accountValue: '150', totalMarginUsed: '40' },
        withdrawable: '50',
      },
    });
    const hip3 = parsePerpsAccount({
      ...clearinghouse,
      crossMarginSummary: { accountValue: '30', totalMarginUsed: '5' },
      withdrawable: '9',
    }, null, 'disabled', 'xyz');
    const aggregate = aggregatePerpsAccounts([updated, hip3]);
    expect(initial.availableBalanceExact).toBe('80');
    expect(updated.availableBalanceExact).toBe('110');
    expect(updated.withdrawableExact).toBe('50');
    expect(aggregate.availableBalanceExact).toBe('135');
    expect(aggregate.withdrawableExact).toBe('59');
  });

  it('clamps exhausted cross availability to zero while preserving the reported withdrawal value', () => {
    for (const totalMarginUsed of ['20', '30']) {
      const value = parsePerpsAccount({
        ...clearinghouse,
        crossMarginSummary: { accountValue: '20', totalMarginUsed },
      }, spot, 'disabled');
      expect(value.availableBalanceExact).toBe('0');
      expect(value.withdrawableExact).toBe('90');
    }
  });

  it('keeps missing or invalid cross availability unknown through aggregation', () => {
    const hip3 = parsePerpsAccount(clearinghouse, null, 'disabled', 'xyz');
    for (const crossMarginSummary of [
      undefined, {}, { accountValue: '100' }, { totalMarginUsed: '20' },
      { accountValue: 'bad', totalMarginUsed: '20' },
      { accountValue: '100', totalMarginUsed: null },
    ]) {
      const value = parsePerpsAccount({ ...clearinghouse, crossMarginSummary }, spot, 'disabled');
      expect(value.availableBalanceExact).toBeNull();
      expect(value.totalBalanceExact).toBe('120');
      expect(value.withdrawableExact).toBe('90');
      expect(aggregatePerpsAccounts([value, hip3]).availableBalanceExact).toBeNull();
    }
    expect(parsePerpsAccount(null, spot, 'disabled').availableBalanceExact).toBeNull();
  });

  ['unifiedAccount', 'portfolioMargin'].forEach((mode: PerpsAccountMode) => {
    it(`uses USDC once without valuing other collateral for ${mode}`, () => {
      const value = parsePerpsAccount(clearinghouse, {
        balances: [...spot.balances, { coin: 'HYPE', token: 150, total: '100', hold: '0' }],
      }, mode);
      const hip3 = parsePerpsAccount(clearinghouse, null, mode, 'xyz');
      const aggregate = aggregatePerpsAccounts([value, hip3]);
      expect(aggregate.totalBalanceExact).toBe('1000');
      expect(aggregate.availableBalanceExact).toBe('960');
    });
  });

  it('keeps the mainnet PM withdrawal hold through snapshots, perps frames and DEX aggregation', () => {
    const value = parsePerpsAccount(clearinghouse, {
      balances: [{ coin: 'USDC', token: 0,
        total: '-32076737.2488308251', hold: '-34634639.2030168176',
        spotHold: '-32076737.2488308251' }],
    }, 'portfolioMargin');
    const updated = updatePerpsAccountFromClearinghouseState(value, clearinghouse);
    const hip3 = parsePerpsAccount(clearinghouse, null, 'portfolioMargin', 'xyz');
    const aggregate = aggregatePerpsAccounts([hip3, updated]);

    expect(updated.spotUsdcSpotHoldExact).toBe('-32076737.2488308251');
    expect(updated.availableBalanceExact).toBe('2557901.9541859925');
    expect(aggregate.spotUsdcSpotHoldExact).toBe('-32076737.2488308251');
    expect(aggregate.withdrawableExact).toBe('0');
    expect(aggregate.availableBalanceExact).toBe('2557901.9541859925');
  });

  it('updates spotHold from spot frames and returns to hold when the field disappears', () => {
    const initial = parsePerpsAccount(clearinghouse, spot, 'portfolioMargin');
    const updated = updatePerpsAccountFromSpotState(initial, {
      spotState: { balances: [{ coin: 'USDC', token: 0, total: '10', hold: '-100', spotHold: '0' }] },
    });
    const afterPerps = updatePerpsAccountFromClearinghouseState(updated, clearinghouse);
    expect(afterPerps.spotUsdcSpotHoldExact).toBe('0');
    expect(aggregatePerpsAccounts([afterPerps]).withdrawableExact).toBe('10');

    const withoutSpotHold = updatePerpsAccountFromSpotState(afterPerps, {
      spotState: { balances: [{ coin: 'USDC', token: 0, total: '10', hold: '3' }] },
    });
    expect(withoutSpotHold.spotUsdcSpotHoldExact).toBeUndefined();
    expect(aggregatePerpsAccounts([withoutSpotHold]).withdrawableExact).toBe('7');
  });

  it('keeps cumulative funding since open on the position', () => {
    const value = parsePerpsAccount(
      {
        ...clearinghouse,
        assetPositions: [
          {
            position: {
              coin: 'ETH',
              szi: '1',
              cumFunding: { sinceOpen: '-0.12' },
            },
          },
        ],
      },
      spot,
      'disabled'
    );
    expect(value.positions[0].fundingSinceOpenExact).toBe('-0.12');
  });

  it('keeps a real zero and leaves missing or illegal numbers empty', () => {
    const value = parsePerpsAccount(
      {
        marginSummary: {
          accountValue: '0',
          totalMarginUsed: 'nope',
          totalNtlPos: '',
        },
        withdrawable: '0',
        assetPositions: [
          {
            position: {
              coin: 'ETH',
              szi: '1',
              entryPx: undefined,
              unrealizedPnl: '0',
              liquidationPx: 'not-a-price',
            },
          },
          { position: { coin: 'ZERO', szi: '0', unrealizedPnl: '5' } },
          { position: { coin: 'MISSING', szi: null, unrealizedPnl: '5' } },
        ],
      },
      { balances: [{ coin: 'USDC', total: '10', hold: 'bad' }] },
      'disabled'
    );

    expect(value.totalBalanceExact).toBe('0');
    expect(value.withdrawableExact).toBe('0');
    expect(value.totalMarginUsedExact).toBeNull();
    expect(value.totalNtlPosExact).toBeNull();
    expect(value.spotUsdcExact).toBe('10');
    expect(value.spotUsdcHoldExact).toBeNull();
    expect(value.positions.length).toBe(1);
    expect(value.positions[0].unrealizedPnlExact).toBe('0');
    expect(value.positions[0].entryPxExact).toBeNull();
    expect(value.positions[0].liquidationPxExact).toBeNull();

    const explicitNull = parsePerpsAccount(
      {
        ...clearinghouse,
        assetPositions: [{ position: { coin: 'ETH', szi: '1', liquidationPx: null } }],
      },
      spot,
      'disabled'
    );
    expect(explicitNull.positions[0].liquidationPxExact).toBeNull();

    const zeroLiq = parsePerpsAccount(
      {
        ...clearinghouse,
        assetPositions: [{ position: { coin: 'ETH', szi: '1', liquidationPx: '0' } }],
      },
      spot,
      'disabled'
    );
    expect(zeroLiq.positions[0].liquidationPxExact).toBe('0');
  });
});
