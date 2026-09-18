import BigNumber from 'bignumber.js';
import { PerpsOrderProtection, perpsPriceDecimals } from './perps';

/** 触发价格遵循该市场报价精度，保持十进制字符串。 */
export function protectionPrice(value: string, szDecimals: number): string | null {
  if (!/^\d+(?:\.\d*)?$/.test(value ?? '')) { return null; }
  const price = new BigNumber(value);
  if (!price.isFinite() || !price.isGreaterThan(0)) { return null; }
  const rounded = price.decimalPlaces(perpsPriceDecimals(price, szDecimals), BigNumber.ROUND_HALF_UP);
  return rounded.isGreaterThan(0) ? rounded.toFixed() : null;
}

export function validProtection(protection: PerpsOrderProtection, entry: string, isLong: boolean, szDecimals: number): boolean {
  const reference = new BigNumber(entry);
  if (!reference.isFinite() || !reference.isGreaterThan(0) ||
      (!protection?.takeProfitPriceExact && !protection?.stopLossPriceExact)) { return false; }
  return ([['takeProfitPriceExact', isLong], ['stopLossPriceExact', !isLong]] as const).every(([key, above]) => {
    const value = protection[key];
    if (value === undefined) { return true; }
    const price = new BigNumber(value);
    return protectionPrice(value, szDecimals) === value && (above ? price.gt(reference) : price.lt(reference));
  });
}
