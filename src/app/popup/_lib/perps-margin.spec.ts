import BigNumber from 'bignumber.js';
import { crossLiquidationPrice, isolatedLiquidationPrice, maintenanceMargin, resolveMarginTiers } from './perps-margin';
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

describe('cross liquidation price', () => {
  const tiers = [{ lowerBoundExact: '0', maxLeverage: 10 }];
  const quote = (size: string, equity = '20', maintenance = '5', held = '0', execution = '100', mark = '100') =>
    crossLiquidationPrice({
      equityExact: equity,
      maintenanceMarginExact: maintenance,
      positions: held === '0' ? [] : [{
        coin: 'BTC', sziExact: held, positionValueExact: new BigNumber(held).abs().times(100).toFixed(),
      }],
    }, 'BTC', new BigNumber(size), new BigNumber(execution), new BigNumber(mark), tiers);

  it('includes the whole shared cushion in the BTC example, not only the free 60 USDC', () => {
    const price = crossLiquidationPrice({
      equityExact: '116.03', maintenanceMarginExact: '9', positions: [],
    }, 'BTC', new BigNumber('0.00626'), new BigNumber('76660'), new BigNumber('76660'),
    [{ lowerBoundExact: '0', maxLeverage: 40 }]);
    expect(Number(price)).toBeCloseTo(60317, 0);
  });

  it('solves both directions while keeping other markets maintenance fixed', () => {
    expect(Number(quote('1'))).toBeCloseTo(89.47368421, 7);
    expect(Number(quote('-1'))).toBeCloseTo(109.52380952, 7);
    expect(Number(quote('1', '20', '0'))).toBeCloseTo(84.21052632, 7);
  });

  it('replaces the held position maintenance when adding size instead of counting it twice', () => {
    expect(Number(quote('1', '40', '10', '1'))).toBeCloseTo(86.84210526, 7);
  });

  it('handles partial reduction, exact close and reversal at the execution price', () => {
    expect(Number(quote('-0.5', '40', '10', '1', '110'))).toBeCloseTo(21.05263158, 7);
    expect(quote('-1', '40', '10', '1')).toBeNull();
    expect(Number(quote('-2', '40', '10', '1', '110'))).toBeCloseTo(147.61904762, 7);
  });

  it('adjusts old and new exposure to the latest mark without adding existing pnl twice', () => {
    expect(Number(quote('1', '20', '10', '1', '120', '120'))).toBeCloseTo(107.89473684, 7);
    expect(Number(quote('1', '20', '5', '0', '90'))).toBeCloseTo(78.94736842, 7);
  });

  it('uses tier deductions and selects the tier at liquidation', () => {
    const table = [{ lowerBoundExact: '0', maxLeverage: 10 }, { lowerBoundExact: '300', maxLeverage: 5 }];
    expect(maintenanceMargin(new BigNumber('400'), table).toFixed()).toBe('25');
    const price = crossLiquidationPrice({ equityExact: '100', maintenanceMarginExact: '0', positions: [] },
      'BTC', new BigNumber('-2.9'), new BigNumber(100), new BigNumber(100), table);
    expect(Number(price)).toBeCloseTo(126.95924765, 7);
  });

  it('does not quote incomplete or inconsistent collateral data or a non-positive root', () => {
    expect(quote('1', 'NaN')).toBeNull();
    expect(quote('1', '1000')).toBeNull();
    expect(quote('1', '20', '1', '1')).toBeNull();
    expect(crossLiquidationPrice(null, 'BTC', new BigNumber(1), new BigNumber(100), new BigNumber(100), tiers)).toBeNull();
  });
});
