import { CID } from 'multiformats/cid';
const TIMEOUT_ERROR = new Error('timeout');

/**
 * Gets the '_value' parameter of the given token transaction data
 * (i.e function call) per the Human Standard Token ABI, if present.
 *
 * @param {object} tokenData - ethers Interface token data.
 * @returns {string | undefined} A decimal string value.
 */

import BigNumber from 'bignumber.js';

/**
 * Gets either the '_tokenId' parameter or the 'id' param of the passed token transaction data.,
 * These are the parsed tokenId values returned by `parseStandardTokenTransactionData` as defined
 * in the ERC721 and ERC1155 ABIs from metamask-eth-abis (https://github.com/MetaMask/metamask-eth-abis/tree/main/src/abis)
 *
 * @param {object} tokenData - ethers Interface token data.
 * @returns {string | undefined} A decimal string value.
 */
export function getTokenIdParam(tokenData: any = {}) {
  return (
    tokenData?.args?._tokenId?.toString() ?? tokenData?.args?.id?.toString()
  );
}

export function getTokenValueParam(tokenData: any = {}) {
  return tokenData?.args?._value?.toString();
}

/**
 * Attempts to get the address parameter of the given token transaction data
 * (i.e. function call) per the Human Standard Token ABI, in the following
 * order:
 *   - The '_to' parameter, if present
 *   - The first parameter, if present
 *
 * @param {object} tokenData - ethers Interface token data.
 * @returns {string | undefined} A lowercase address string.
 */
export function getTokenAddressParam(tokenData: any = {}) {
  const value =
    tokenData?.args?._to || tokenData?.args?.to || tokenData?.args?.[0];
  return value?.toString().toLowerCase();
}

/**
 * Compare 2 given strings and return boolean
 * eg: "foo" and "FOO" => true
 * eg: "foo" and "bar" => false
 * eg: "foo" and 123 => false
 *
 * @param value1 - first string to compare
 * @param value2 - first string to compare
 * @returns true if 2 strings are identical when they are lowercase
 */
export function isEqualCaseInsensitive(
  value1: string,
  value2: string
): boolean {
  if (typeof value1 !== 'string' || typeof value2 !== 'string') {
    return false;
  }
  return value1.toLowerCase() === value2.toLowerCase();
}

export function calcTokenAmount(value, decimals) {
  const multiplier = Math.pow(10, Number(decimals || 0));
  return new BigNumber(String(value)).div(multiplier);
}

/**
 * Execute and return an asynchronous operation without throwing errors.
 *
 * @param operation - Function returning a Promise.
 * @param logError - Determines if the error should be logged.
 * @template Result - Type of the result of the async operation
 * @returns Promise resolving to the result of the async operation.
 */
export async function safelyExecute<Result>(
  operation: () => Promise<Result>,
  logError = false,
): Promise<Result | undefined> {
  try {
    return await operation();
  } catch (error) {
    /* istanbul ignore next */
    if (logError) {
      console.error(error);
    }
    return undefined;
  }
}
/**
 * Formats URL correctly for use retrieving assets hosted on IPFS.
 *
 * @param ipfsGateway - The users preferred IPFS gateway (full URL or just host).
 * @param ipfsUrl - The IFPS URL pointed at the asset.
 * @param subdomainSupported - Boolean indicating whether the URL should be formatted with subdomains or not.
 * @returns A formatted URL, with the user's preferred IPFS gateway and format (subdomain or not), pointing to an asset hosted on IPFS.
 */
export function getFormattedIpfsUrl(
  ipfsGateway: string,
  ipfsUrl: string,
  subdomainSupported: boolean,
): string {
  const { host, protocol, origin } = new URL(addUrlProtocolPrefix(ipfsGateway));
  if (subdomainSupported) {
    const { cid, path } = getIpfsCIDv1AndPath(ipfsUrl);
    return `${protocol}//${cid}.ipfs.${host}${path ?? ''}`;
  }
  const cidAndPath = removeIpfsProtocolPrefix(ipfsUrl);
  return `${origin}/ipfs/${cidAndPath}`;
}
/**
 * Adds URL protocol prefix to input URL string if missing.
 *
 * @param urlString - An IPFS URL.
 * @returns A URL with a https:// prepended.
 */
export function addUrlProtocolPrefix(urlString: string): string {
  if (!urlString.match(/(^http:\/\/)|(^https:\/\/)/u)) {
    return `https://${urlString}`;
  }
  return urlString;
}
/**
 * Extracts content identifier and path from an input string.
 *
 * @param ipfsUrl - An IPFS URL minus the IPFS protocol prefix
 * @returns IFPS content identifier (cid) and sub path as string.
 * @throws Will throw if the url passed is not ipfs.
 */
export function getIpfsCIDv1AndPath(ipfsUrl: string): {
  cid: string;
  path?: string;
} {
  const url = removeIpfsProtocolPrefix(ipfsUrl);

  // check if there is a path
  // (CID is everything preceding first forward slash, path is everything after)
  const index = url.indexOf('/');
  const cid = index !== -1 ? url.substring(0, index) : url;
  const path = index !== -1 ? url.substring(index) : undefined;

  // We want to ensure that the CID is v1 (https://docs.ipfs.io/concepts/content-addressing/#identifier-formats)
  // because most cid v0s appear to be incompatible with IPFS subdomains
  return {
    cid: CID.parse(cid).toV1().toString(),
    path,
  };
}

/**
 * Removes IPFS protocol prefix from input string.
 *
 * @param ipfsUrl - An IPFS url (e.g. ipfs://{content id})
 * @returns IPFS content identifier and (possibly) path in a string
 * @throws Will throw if the url passed is not IPFS.
 */
export function removeIpfsProtocolPrefix(ipfsUrl: string) {
  if (ipfsUrl.startsWith('ipfs://ipfs/')) {
    return ipfsUrl.replace('ipfs://ipfs/', '');
  } else if (ipfsUrl.startsWith('ipfs://')) {
    return ipfsUrl.replace('ipfs://', '');
  }
  // this method should not be used with non-ipfs urls (i.e. startsWith('ipfs://') === true)
  throw new Error('this method should not be used with non ipfs urls');
}
/**
 * Fetch that fails after timeout.
 *
 * @param url - Url to fetch.
 * @param options - Options to send with the request.
 * @param timeout - Timeout to fail request.
 * @returns Promise resolving the request.
 */
export async function timeoutFetch(
  url: string,
  options?: RequestInit,
  timeout = 500,
): Promise<Response> {
  return Promise.race([
    successfulFetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => {
        reject(TIMEOUT_ERROR);
      }, timeout),
    ),
  ]);
}

/**
 * Execute fetch and verify that the response was successful.
 *
 * @param request - Request information.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
export async function successfulFetch(
  request: RequestInfo,
  options?: RequestInit,
) {
  const response = await fetch(request, options);
  if (!response.ok) {
    throw new Error(
      `Fetch failed with status '${response.status}' for request '${String(
        request,
      )}'`,
    );
  }
  return response;
}

/**
 * Prefixes a hex string with '0x' or '-0x' and returns it. Idempotent.
 *
 * @param str - The string to prefix.
 * @returns The prefixed string.
 */
export const addHexPrefix = (str: string) => {
  if (typeof str !== 'string' || str.match(/^-?0x/u)) {
    return str;
  }

  if (str.match(/^-?0X/u)) {
    return str.replace('0X', '0x');
  }

  if (str.startsWith('-')) {
    return str.replace('-', '-0x');
  }

  return `0x${str}`;
};
