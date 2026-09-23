import {
  aggregatePerpsAccounts,
  parsePerpsAccount,
  updatePerpsAccountFromClearinghouseState,
  updatePerpsAccountFromSpotState,
} from './perps-account-state';
import { PerpsAccountMode } from '@popup/_lib/perps';

const clearinghouse = {
  marginSummary: { accountValue: '120', totalMarginUsed: '20', totalNtlPos: '100' },
  withdrawable: '90',
  crossMaintenanceMarginUsed: '5',
  assetPositions: [{ position: { coin: 'ETH', szi: '1' } }],
};
const spot = { balances: [{ coin: 'USDC', token: 0, total: '1000', hold: '40' }] };

describe('Perps account mode balances', () => {
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
      expect(value.availableBalanceExact).toBe('90');
      expect(value.spotUsdcExact).toBe('1000');
      const updated = updatePerpsAccountFromSpotState(value, {
        balances: [{ coin: 'USDC', total: '2000', hold: '0' }],
      });
      expect(updated.availableBalanceExact).toBe('90');
    });
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
