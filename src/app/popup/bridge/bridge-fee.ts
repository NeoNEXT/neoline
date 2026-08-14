import BigNumber from 'bignumber.js';

export function hasEnoughGasForBridgeFees(
  gasBalance: string | undefined,
  ...fees: string[]
): boolean {
  if (gasBalance === undefined) return false;

  const balance = new BigNumber(gasBalance);
  const required = fees.reduce(
    (total, fee) => total.plus(fee),
    new BigNumber(0)
  );

  return balance.isFinite() && required.isFinite() && balance.gte(required);
}
