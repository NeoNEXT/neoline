import {
  MessageTypes,
  TypedMessage,
} from '@metamask/eth-sig-util';

export interface EvmPermitRequest {
  type: 'permit' | 'permit2';
  rawAmount: string;
  spender: string;
  tokenAddress: string;
  interactingAddress: string;
}

export function getEvmPermitRequest(
  typedData: TypedMessage<MessageTypes>
): EvmPermitRequest | undefined {
  if (!typedData?.message || !typedData?.domain) {
    return undefined;
  }

  const message: any = typedData.message;
  const domain: any = typedData.domain;

  if (
    typedData.primaryType === 'PermitSingle' &&
    message.details?.token &&
    message.details?.amount !== undefined &&
    message.details?.amount !== null &&
    message.spender
  ) {
    return {
      type: 'permit2',
      rawAmount: message.details.amount.toString(),
      spender: message.spender,
      tokenAddress: message.details.token,
      interactingAddress: domain.verifyingContract,
    };
  }

  if (
    typedData.primaryType === 'Permit' &&
    domain.verifyingContract &&
    message.value !== undefined &&
    message.value !== null &&
    message.spender
  ) {
    return {
      type: 'permit',
      rawAmount: message.value.toString(),
      spender: message.spender,
      tokenAddress: domain.verifyingContract,
      interactingAddress: domain.verifyingContract,
    };
  }

  return undefined;
}
