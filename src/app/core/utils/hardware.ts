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
