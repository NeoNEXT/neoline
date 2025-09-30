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
