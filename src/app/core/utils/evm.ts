import { TypedDataEncoder, TypedDataDomain } from 'ethers';
import { MessageTypes, TypedMessage } from '@metamask/eth-sig-util';

export function transformTypedDataPlugin(
  typedData: TypedMessage<MessageTypes>
) {
  const domain: TypedDataDomain = {
    ...typedData.domain,
  } as TypedDataDomain;
  if (domain.salt) {
    domain.salt = new Uint8Array(domain.salt as ArrayBuffer);
  }
  const domainHash = TypedDataEncoder.hashDomain(domain);

  const types = { ...typedData.types };
  delete types.EIP712Domain;
  const messageHash = TypedDataEncoder.from(types).hashStruct(
    typedData.primaryType as string,
    typedData.message
  );
  return { domainHash, messageHash };
}

/**
 * EVM chains where GoPlus token-security works — the offline / first-run
 * fallback for {@link GoPlusService}. Sourced from
 * https://api.gopluslabs.io/api/v1/supported_chains?name=token_security
 * The `name` filter matters: the unfiltered list is a union across GoPlus
 * functions and includes chains (e.g. 185) that token-security can't analyze.
 * Synced 2026-06; GoPlusService refreshes this at runtime, so a stale entry only
 * briefly hides/shows the convenience link — never a wrong safety call.
 */
export const GOPLUS_SUPPORTED_CHAIN_IDS = new Set<number>([
  1, 10, 25, 56, 100, 130, 137, 143, 146, 169, 177, 196, 204, 321, 324, 480,
  1030, 1514, 1625, 1672, 1868, 2741, 2818, 4200, 5000, 8453, 9745, 42161,
  42766, 43114, 48900, 59144, 80094, 81457, 200901, 201022, 534352, 688688,
  810180, 5734951,
]);

export function detectContractSecurityToThirdPartySite(
  chainId: number,
  address: string
) {
  window.open(`https://gopluslabs.io/token-security/${chainId}/${address}`);
}

export function getHexDataLength(henData: string) {
  if (!henData) return;
  let value = henData.startsWith('0x') ? henData.substring(2) : henData;
  if (value.length >= 2 && value.length % 2 === 0) {
    return value.length / 2;
  }
  return 0;
}
