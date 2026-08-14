import BigNumber from 'bignumber.js';

export function isValidBridgeBalance(balance: string | undefined): boolean {
  return balance !== undefined && new BigNumber(balance).isFinite();
}

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

export function getMaxBridgeAmount(
  balance: string,
  networkFee: string,
  decimals: number
): string {
  return new BigNumber(balance)
    .minus(networkFee)
    .dp(decimals, BigNumber.ROUND_DOWN)
    .toFixed();
}
