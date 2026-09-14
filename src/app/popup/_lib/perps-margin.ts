import BigNumber from 'bignumber.js';
import { PerpsMarginTier, PerpsMeta } from './perps';

/** 分档按 DEX 的 meta 解析；小于 50 的协议 ID 自带单档杠杆定义。 */
export function resolveMarginTiers(
  id: number | undefined,
  tables: PerpsMeta['marginTables']
): PerpsMarginTier[] | null {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  const raw = id < 50
    ? [{ lowerBound: '0', maxLeverage: id }]
    : (Array.isArray(tables) ? tables : []).find((table) => table?.[0] === id)?.[1]?.marginTiers;
  if (!Array.isArray(raw) || !raw.length) {
    return null;
  }
  const tiers = raw.map((tier) => ({
    lowerBoundExact: tier?.lowerBound,
    maxLeverage: tier?.maxLeverage,
  }));
  return validTiers(tiers) ? tiers : null;
}

function validTiers(tiers: PerpsMarginTier[] | null): boolean {
  return Array.isArray(tiers) && tiers.length > 0 && tiers.every((tier, index) => {
    const lower = new BigNumber(tier?.lowerBoundExact ?? NaN);
    return lower.isFinite() &&
      Number.isSafeInteger(tier?.maxLeverage) && tier.maxLeverage >= 1 &&
      (index === 0 ? lower.isZero() :
        lower.isGreaterThan(tiers[index - 1].lowerBoundExact) &&
        tier.maxLeverage <= tiers[index - 1].maxLeverage);
  });
}

/**
 * 逐仓权益 = collateral + side * (size * price - entryNotional)。
 * 维持保证金 = size * price / (2 * tierLeverage) - deduction。
 * 解两式相等，再按强平价处的名义价值选档，而不是按当前标记价值选档。
 * 分档扣减额和候选价保留为分子/分母，比较边界前不舍入循环小数。
 */
export function isolatedLiquidationPrice(
  size: BigNumber,
  entryNotional: BigNumber,
  collateral: BigNumber,
  isLong: boolean,
  tiers: PerpsMarginTier[] | null
): string | null {
  if (!validTiers(tiers) || !size.isFinite() || !size.isGreaterThan(0) ||
      !entryNotional.isFinite() || !entryNotional.isGreaterThan(0) ||
      !collateral.isFinite()) {
    return null;
  }
  const side = isLong ? 1 : -1;
  let deductionNumerator = new BigNumber(0);
  let deductionDenominator = new BigNumber(1);
  let previousRateDenominator = new BigNumber(1);
  for (let index = 0; index < tiers.length; index++) {
    const tier = tiers[index];
    const rateDenominator = new BigNumber(tier.maxLeverage).times(2);
    if (index > 0) {
      // D_n = D_(n-1) + lower_n * (rate_n - rate_(n-1)).
      const common = rateDenominator.times(previousRateDenominator);
      deductionNumerator = deductionNumerator.times(common).plus(
        new BigNumber(tier.lowerBoundExact)
          .times(previousRateDenominator.minus(rateDenominator))
          .times(deductionDenominator)
      );
      deductionDenominator = deductionDenominator.times(common);
    }
    previousRateDenominator = rateDenominator;
    const numerator = entryNotional.minus(collateral.times(side))
      .times(deductionDenominator)
      .minus(deductionNumerator.times(side))
      .times(rateDenominator);
    const denominator = size.times(deductionDenominator)
      .times(rateDenominator.minus(side));
    const liquidationNotionalNumerator = numerator.times(size);
    const next = tiers[index + 1];
    if (numerator.isGreaterThan(0) &&
        liquidationNotionalNumerator.isGreaterThanOrEqualTo(
          denominator.times(tier.lowerBoundExact)
        ) && (!next || liquidationNotionalNumerator.isLessThan(
          denominator.times(next.lowerBoundExact)
        ))) {
      return numerator.dividedBy(denominator).toFixed();
    }
  }
  return null;
}
