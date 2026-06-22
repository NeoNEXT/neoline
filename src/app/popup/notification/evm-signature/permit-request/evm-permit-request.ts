import {
  MessageTypes,
  TypedMessage,
} from '@metamask/eth-sig-util';
import { ethers } from 'ethers';

export const PERMIT2_ADDRESS =
  '0x000000000022d473030f116ddee9f6b43ac78ba3';

export type EvmPermitVariant =
  | 'eip2612'
  | 'dai'
  | 'permit2-single'
  | 'permit2-batch';

export interface EvmPermitEntry {
  tokenAddress: string;
  rawAmount?: string;
  expiration?: string;
  nonce: string;
}

export interface EvmPermitRequest {
  type: 'permit' | 'permit2';
  variant: EvmPermitVariant;
  owner: string;
  spender: string;
  interactingAddress: string;
  entries: EvmPermitEntry[];
  deadline?: string;
  allowed?: boolean;
}

interface TypedField {
  name: string;
  type: string;
}

const EIP_2612_FIELDS: TypedField[] = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
];

const DAI_FIELDS: TypedField[] = [
  { name: 'holder', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'expiry', type: 'uint256' },
  { name: 'allowed', type: 'bool' },
];

const PERMIT_DETAILS_FIELDS: TypedField[] = [
  { name: 'token', type: 'address' },
  { name: 'amount', type: 'uint160' },
  { name: 'expiration', type: 'uint48' },
  { name: 'nonce', type: 'uint48' },
];

const PERMIT_SINGLE_FIELDS: TypedField[] = [
  { name: 'details', type: 'PermitDetails' },
  { name: 'spender', type: 'address' },
  { name: 'sigDeadline', type: 'uint256' },
];

const PERMIT_BATCH_FIELDS: TypedField[] = [
  { name: 'details', type: 'PermitDetails[]' },
  { name: 'spender', type: 'address' },
  { name: 'sigDeadline', type: 'uint256' },
];

export function getEvmPermitRequest(
  typedData: TypedMessage<MessageTypes>,
  expectedChainId?: number
): EvmPermitRequest | undefined {
  if (!typedData?.message || !typedData?.domain || !typedData?.types) {
    return undefined;
  }

  if (!matchesChainId((typedData.domain as any).chainId, expectedChainId)) {
    return undefined;
  }

  if (typedData.primaryType === 'Permit') {
    return parsePermit(typedData);
  }

  if (typedData.primaryType === 'PermitSingle') {
    return parsePermit2(typedData, false);
  }

  if (typedData.primaryType === 'PermitBatch') {
    return parsePermit2(typedData, true);
  }

  return undefined;
}

function parsePermit(
  typedData: TypedMessage<MessageTypes>
): EvmPermitRequest | undefined {
  const message: any = typedData.message;
  const tokenAddress = String(
    (typedData.domain as any).verifyingContract || ''
  );

  if (!ethers.isAddress(tokenAddress) || !ethers.isAddress(message.spender)) {
    return undefined;
  }

  if (matchesFields(typedData.types.Permit, EIP_2612_FIELDS)) {
    if (
      !hasExactKeys(message, EIP_2612_FIELDS) ||
      !ethers.isAddress(message.owner) ||
      !isUint(message.value, 256) ||
      !isUint(message.nonce, 256) ||
      !isUint(message.deadline, 256)
    ) {
      return undefined;
    }

    return {
      type: 'permit',
      variant: 'eip2612',
      owner: message.owner,
      spender: message.spender,
      interactingAddress: tokenAddress,
      entries: [
        {
          tokenAddress,
          rawAmount: String(message.value),
          nonce: String(message.nonce),
        },
      ],
      deadline: String(message.deadline),
    };
  }

  if (matchesFields(typedData.types.Permit, DAI_FIELDS)) {
    if (
      !hasExactKeys(message, DAI_FIELDS) ||
      !ethers.isAddress(message.holder) ||
      !isUint(message.nonce, 256) ||
      !isUint(message.expiry, 256) ||
      typeof message.allowed !== 'boolean'
    ) {
      return undefined;
    }

    return {
      type: 'permit',
      variant: 'dai',
      owner: message.holder,
      spender: message.spender,
      interactingAddress: tokenAddress,
      entries: [{ tokenAddress, nonce: String(message.nonce) }],
      deadline: String(message.expiry),
      allowed: message.allowed,
    };
  }

  return undefined;
}

function parsePermit2(
  typedData: TypedMessage<MessageTypes>,
  isBatch: boolean
): EvmPermitRequest | undefined {
  const message: any = typedData.message;
  const verifyingContract = String(
    (typedData.domain as any).verifyingContract || ''
  );
  const primaryFields = isBatch ? PERMIT_BATCH_FIELDS : PERMIT_SINGLE_FIELDS;

  if (
    verifyingContract.toLowerCase() !== PERMIT2_ADDRESS ||
    !matchesFields(typedData.types.PermitDetails, PERMIT_DETAILS_FIELDS) ||
    !matchesFields(typedData.types[typedData.primaryType], primaryFields) ||
    !hasExactKeys(message, primaryFields) ||
    !ethers.isAddress(message.spender) ||
    !isUint(message.sigDeadline, 256)
  ) {
    return undefined;
  }

  const details = isBatch ? message.details : [message.details];
  if (!Array.isArray(details) || details.length === 0) {
    return undefined;
  }

  const entries = details.map(parsePermitDetails);
  if (entries.some((entry) => !entry)) {
    return undefined;
  }

  return {
    type: 'permit2',
    variant: isBatch ? 'permit2-batch' : 'permit2-single',
    owner: '',
    spender: message.spender,
    interactingAddress: verifyingContract,
    entries,
    deadline: String(message.sigDeadline),
  };
}

function parsePermitDetails(value: any): EvmPermitEntry | undefined {
  if (
    !value ||
    !hasExactKeys(value, PERMIT_DETAILS_FIELDS) ||
    !ethers.isAddress(value.token) ||
    !isUint(value.amount, 160) ||
    !isUint(value.expiration, 48) ||
    !isUint(value.nonce, 48)
  ) {
    return undefined;
  }

  return {
    tokenAddress: value.token,
    rawAmount: String(value.amount),
    expiration: String(value.expiration),
    nonce: String(value.nonce),
  };
}

function matchesFields(actual: TypedField[], expected: TypedField[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every(
      (field, index) =>
        field.name === expected[index].name && field.type === expected[index].type
    )
  );
}

function hasExactKeys(value: any, fields: TypedField[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === fields.length &&
    fields.every((field) => Object.prototype.hasOwnProperty.call(value, field.name))
  );
}

function isUint(value: unknown, bits: number): boolean {
  try {
    if (
      (typeof value !== 'string' && typeof value !== 'number' &&
        typeof value !== 'bigint') ||
      String(value).trim() === ''
    ) {
      return false;
    }
    const parsed = BigInt(value as string | number | bigint);
    return parsed >= 0n && parsed < 1n << BigInt(bits);
  } catch {
    return false;
  }
}

function matchesChainId(
  actualChainId: unknown,
  expectedChainId?: number
): boolean {
  if (expectedChainId === undefined || actualChainId === undefined) {
    return true;
  }
  try {
    return BigInt(actualChainId as string | number) === BigInt(expectedChainId);
  } catch {
    return false;
  }
}
