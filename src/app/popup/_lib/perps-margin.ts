import BigNumber from 'bignumber.js';
import { PerpsCrossMarginAccount, PerpsMarginTier, PerpsMeta } from './perps';

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

/** 对名义价值逐档累计维持保证金，等价于当前档费率乘名义价值再减分档扣减额。 */
export function maintenanceMargin(notional: BigNumber, tiers: PerpsMarginTier[] | null): BigNumber | null {
  if (!validTiers(tiers) || !notional.isFinite() || notional.isNegative()) { return null; }
  let result = new BigNumber(0);
  for (let index = 0; index < tiers.length; index++) {
    const lower = new BigNumber(tiers[index].lowerBoundExact);
    if (notional.isLessThanOrEqualTo(lower)) { break; }
    const upper = tiers[index + 1]?.lowerBoundExact ?? notional;
    result = result.plus(BigNumber.minimum(notional, upper).minus(lower)
      .dividedBy(2 * tiers[index].maxLeverage));
  }
  return result;
}

/**
 * 其他市场价格不变时，求成交后净仓位的全仓强平价。无需订单杠杆。
 * 账户权益包含原仓位盈亏；只加新交易和标记价变化的增量，避免重复计入。
 * E(x) = E(snapshot) + held * (x - snapshotMark) + signedOrder * (x - executionPrice)。
 * 扣除其他仓位的维持保证金后，复用同一个分档方程求解目标仓位。
 * https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations
 */
export function crossLiquidationPrice(
  account: PerpsCrossMarginAccount | null | undefined,
  coin: string,
  signedOrderSize: BigNumber,
  executionPrice: BigNumber,
  markPrice: BigNumber,
  tiers: PerpsMarginTier[] | null
): string | null {
  if (!account || !signedOrderSize.isFinite() || signedOrderSize.isZero() ||
      !executionPrice.isFinite() || !executionPrice.isGreaterThan(0) ||
      !markPrice.isFinite() || !markPrice.isGreaterThan(0)) { return null; }
  const equity = new BigNumber(account.equityExact);
  const required = new BigNumber(account.maintenanceMarginExact);
  const held = account.positions.find((position) => position.coin === coin);
  const heldSize = new BigNumber(held?.sziExact ?? 0);
  const heldNotional = new BigNumber(held?.positionValueExact ?? 0);
  const heldRequired = maintenanceMargin(heldNotional, tiers);
  const netSize = heldSize.plus(signedOrderSize);
  if (!equity.isFinite() || !required.isFinite() || required.isNegative() ||
      !heldSize.isFinite() || !heldRequired || netSize.isZero()) { return null; }
  const otherRequired = required.minus(heldRequired);
  // 协议维持保证金按 USDC 精度返回；容许末位舍入，不容许用不完整快照低估其他仓位。
  if (otherRequired.isLessThan('-0.000001')) { return null; }
  const equityAtMark = equity
    .plus(heldSize.times(markPrice).minus(heldNotional.times(heldSize.isNegative() ? -1 : 1)))
    .plus(signedOrderSize.times(markPrice.minus(executionPrice)));
  return isolatedLiquidationPrice(
    netSize.absoluteValue(),
    netSize.absoluteValue().times(markPrice),
    equityAtMark.minus(BigNumber.maximum(0, otherRequired)),
    netSize.isGreaterThan(0),
    tiers
  );
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
