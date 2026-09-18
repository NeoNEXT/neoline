import BigNumber from 'bignumber.js';
import { PerpsAccountMode, PerpsCrossMarginAccount } from '@popup/_lib/perps';

export type PerpsClearinghouseStates = [string, any][];

export function validClearinghouseStates(states: unknown): states is PerpsClearinghouseStates {
  return Array.isArray(states) && states.length > 0 &&
    states.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string') &&
    new Set(states.map((entry) => entry[0])).size === states.length;
}

const decimal = (value: unknown): BigNumber => new BigNumber(value == null ? NaN : String(value));

/**
 * 普通账户按 DEX 隔离；统一账户按抵押 token 聚合完整快照，现货总额减去逐仓权益。
 * 不能用 spot.hold 或 availableToTrade：其中锁定的全仓初始保证金仍属于共享权益。
 * https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes
 */
export function crossMarginAccount(
  mode: PerpsAccountMode,
  dex: string,
  states: PerpsClearinghouseStates,
  spot: any,
  collateralTokens: Record<string, number | null> = {}
): PerpsCrossMarginAccount | null {
  if (!validClearinghouseStates(states) ||
      !['default', 'disabled', 'unifiedAccount'].includes(mode)) {
    return null;
  }
  const unified = mode === 'unifiedAccount';
  const token = collateralTokens[dex];
  if (unified && (!Number.isSafeInteger(token) || token < 0 || !Array.isArray(spot?.balances))) {
    return null;
  }
  const balance = spot?.balances?.find((item) => item?.token === token);
  let equity = unified ? decimal(balance?.total ?? '0') : new BigNumber(NaN);
  let maintenance = new BigNumber(0);
  const positions: PerpsCrossMarginAccount['positions'] = [];
  for (const [stateDex, state] of states) {
    if (!unified && stateDex !== dex) { continue; }
    if (!Array.isArray(state?.assetPositions)) { return null; }
    const required = decimal(state.crossMaintenanceMarginUsed);
    if (!required.isFinite() || required.isNegative()) { return null; }
    if (unified) {
      // 空 DEX 没有风险占用，不必为了它读取元数据。
      if (!state.assetPositions.length && required.isZero()) { continue; }
      const stateToken = collateralTokens[stateDex];
      if (!Number.isSafeInteger(stateToken) || stateToken < 0) { return null; }
      if (stateToken !== token) { continue; }
    } else {
      equity = decimal(state.crossMarginSummary?.accountValue);
    }
    maintenance = maintenance.plus(required);
    for (const item of state.assetPositions) {
      const position = item?.position;
      const size = decimal(position?.szi);
      if (!size.isFinite()) { return null; }
      if (size.isZero()) { continue; }
      if (position.leverage?.type === 'isolated') {
        const margin = decimal(position.marginUsed);
        if (!margin.isFinite()) { return null; }
        if (unified) { equity = equity.minus(margin); }
      } else if (position.leverage?.type === 'cross') {
        const value = decimal(position.positionValue);
        if (typeof position.coin !== 'string' || !value.isFinite() || !value.isGreaterThan(0)) {
          return null;
        }
        positions.push({ coin: position.coin, sziExact: size.toFixed(), positionValueExact: value.toFixed() });
      } else {
        return null;
      }
    }
  }
  return equity.isFinite()
    ? { equityExact: equity.toFixed(), maintenanceMarginExact: maintenance.toFixed(), positions }
    : null;
}
