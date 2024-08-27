import { MAX_SAFE_CHAIN_ID } from '../../common/data_module_evm';

/**
 * Checks whether the given number primitive chain ID is safe.
 * Because some cryptographic libraries we use expect the chain ID to be a
 * number primitive, it must not exceed a certain size.
 *
 * @param chainId - The chain ID to check for safety.
 * @returns Whether the given chain ID is safe.
 */
export function isSafeChainId(chainId: unknown): boolean {
  return isSafeInteger(chainId) && chainId > 0 && chainId <= MAX_SAFE_CHAIN_ID;
}

/**
 * Checks whether the given value is a 0x-prefixed, non-zero, non-zero-padded,
 * hexadecimal string.
 *
 * @param value - The value to check.
 * @returns True if the value is a correctly formatted hex string,
 * false otherwise.
 */
export function isPrefixedFormattedHexString(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }
  return /^0x[1-9a-f]+[0-9a-f]*$/iu.test(value);
}

/**
 * Like {@link Number.isSafeInteger}, but types the input as a `number` if it is
 * indeed a safe integer.
 *
 * @param value - The value to check.
 * @returns True if the value is a safe integer, false otherwise.
 */
function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}
