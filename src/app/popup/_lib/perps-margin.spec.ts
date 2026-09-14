import BigNumber from 'bignumber.js';
import { isolatedLiquidationPrice, resolveMarginTiers } from './perps-margin';
import { PerpsMarginTier } from './perps';

describe('perps margin tiers', () => {
  const tiers: PerpsMarginTier[] = [
    { lowerBoundExact: '0', maxLeverage: 10 },
    { lowerBoundExact: '3000000', maxLeverage: 5 },
  ];
  const price = (size: string, cost: string, margin: string, long = true, table = tiers) =>
    isolatedLiquidationPrice(new BigNumber(size), new BigNumber(cost), new BigNumber(margin), long, table);

  it('resolves implicit single tiers and explicit tables without converting thresholds to Number', () => {
    expect(resolveMarginTiers(25, undefined)).toEqual([{ lowerBoundExact: '0', maxLeverage: 25 }]);
    expect(resolveMarginTiers(51, [[51, { marginTiers: [
      { lowerBound: '0', maxLeverage: 10 },
      { lowerBound: '9007199254740993.0000001', maxLeverage: 5 },
    ] }]])?.[1].lowerBoundExact).toBe('9007199254740993.0000001');
  });

  it('does not invent a table when metadata is absent or malformed', () => {
    [undefined, 0, -1, 1.5, 50, 51].forEach((id) => expect(resolveMarginTiers(id, [])).toBeNull());
    [[], [{ lowerBound: '1', maxLeverage: 10 }],
      [{ lowerBound: '0', maxLeverage: 0 }],
      [{ lowerBound: '0', maxLeverage: 10 }, { lowerBound: '0', maxLeverage: 5 }],
      [{ lowerBound: '0', maxLeverage: 10 }, { lowerBound: '20', maxLeverage: 20 }],
      [{ lowerBound: 'NaN', maxLeverage: 10 }],
    ].forEach((marginTiers) => expect(resolveMarginTiers(51, [[51, { marginTiers }]])).toBeNull());
    expect(price('1', '100', '10', true, null)).toBeNull();
  });

  it('uses the lower tier when liquidation falls below the entry tier', () => {
    // Entry 3.1m > threshold; liquidation value = 2.1m / 0.95 < threshold.
    expect(Number(price('31000', '3100000', '1000000'))).toBeCloseTo(71.30730050933786, 10);
  });

  it('uses the higher tier and deduction when a short liquidates above the entry tier', () => {
    // Entry 2.9m, liquidation value = (2.9m + 1m + 150k) / 1.1 > threshold.
    expect(Number(price('29000', '2900000', '1000000', false))).toBeCloseTo(126.95924764890282, 10);
  });

  it('keeps the maintenance function continuous exactly at a tier boundary', () => {
    expect(price('30000', '3300000', '450000')).toBe('100');
    expect(price('30000', '2700000', '450000', false)).toBe('100');
  });

  it('selects an exact boundary even when the maintenance rate is a repeating decimal', () => {
    const table = [
      { lowerBoundExact: '0', maxLeverage: 3 },
      { lowerBoundExact: '300', maxLeverage: 2 },
    ];
    expect(price('3', '360', '110', true, table)).toBe('100');
    expect(price('3', '240', '110', false, table)).toBe('100');
  });

  it('accumulates deductions across three tiers', () => {
    const three = [...tiers, { lowerBoundExact: '6000000', maxLeverage: 2 }];
    // D3 = 150k + 6m * (0.25 - 0.1) = 1.05m.
    expect(Number(price('100000', '10000000', '2000000', true, three))).toBeCloseTo(92.66666666666667, 10);
  });

  it('returns no positive liquidation price for zero size or fully collateralized longs', () => {
    expect(price('0', '0', '0')).toBeNull();
    expect(price('1', '100', '100')).toBeNull();
    expect(price('1', '100', 'NaN')).toBeNull();
  });
});
