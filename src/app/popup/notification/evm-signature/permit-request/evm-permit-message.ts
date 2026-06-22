import {
  MessageTypes,
  TypedMessage,
} from '@metamask/eth-sig-util';
import { ethers } from 'ethers';
import { EvmPermitRequest } from './evm-permit-request';

export type PermitMessageNodeKind =
  | 'object'
  | 'array'
  | 'address'
  | 'token'
  | 'amount'
  | 'date'
  | 'boolean'
  | 'primitive';

export type PermitTimestampStatus =
  | 'valid'
  | 'expired'
  | 'no-expiry'
  | 'unparseable';

export interface PermitTimestampDisplay {
  value: string;
  status: PermitTimestampStatus;
}

export interface PermitMessageNode {
  label: string;
  type: string;
  kind: PermitMessageNodeKind;
  rawValue?: unknown;
  displayValue?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  timestamp?: PermitTimestampDisplay;
  children?: PermitMessageNode[];
}

interface TypedField {
  name: string;
  type: string;
}

const DATE_FIELDS = new Set([
  'deadline',
  'expiry',
  'expiration',
  'sigDeadline',
]);
const AMOUNT_FIELDS = new Set(['amount', 'value']);

export function buildPermitMessageTree(
  typedData: TypedMessage<MessageTypes>,
  request: EvmPermitRequest,
  nowMs = Date.now()
): PermitMessageNode[] {
  const fields = typedData.types?.[typedData.primaryType] as TypedField[];
  return buildStructNodes(
    fields || [],
    typedData.message,
    typedData,
    request.entries[0]?.tokenAddress,
    nowMs
  );
}

export function formatPermitAmount(
  rawValue: string,
  decimals?: number
): string {
  if (decimals === undefined) {
    return rawValue;
  }
  try {
    return ethers.formatUnits(rawValue, decimals);
  } catch {
    return rawValue;
  }
}

export function formatPermitTimestamp(
  rawValue: unknown,
  type: string,
  nowMs = Date.now()
): PermitTimestampDisplay {
  let seconds: bigint;
  try {
    seconds = BigInt(rawValue as string | number | bigint);
  } catch {
    return { value: String(rawValue), status: 'unparseable' };
  }

  const bitMatch = /^uint(\d+)$/.exec(type);
  const bits = bitMatch ? Number(bitMatch[1]) : 256;
  const maxValue = (1n << BigInt(bits)) - 1n;
  if (seconds === -1n || seconds === maxValue) {
    return { value: String(rawValue), status: 'no-expiry' };
  }

  const maxDateSeconds = 8640000000000n;
  if (seconds < 0n || seconds > maxDateSeconds) {
    return { value: String(rawValue), status: 'unparseable' };
  }

  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) {
    return { value: String(rawValue), status: 'unparseable' };
  }

  return {
    value: `${formatUtcDate(date)} UTC`,
    status: Number(seconds) * 1000 < nowMs ? 'expired' : 'valid',
  };
}

function buildStructNodes(
  fields: TypedField[],
  value: any,
  typedData: TypedMessage<MessageTypes>,
  inheritedTokenAddress: string,
  nowMs: number
): PermitMessageNode[] {
  const tokenAddress = ethers.isAddress(value?.token)
    ? value.token
    : inheritedTokenAddress;

  return fields.map((field) =>
    buildNode(
      field.name,
      field.type,
      value?.[field.name],
      typedData,
      tokenAddress,
      nowMs
    )
  );
}

function buildNode(
  label: string,
  type: string,
  value: any,
  typedData: TypedMessage<MessageTypes>,
  tokenAddress: string,
  nowMs: number
): PermitMessageNode {
  if (type.endsWith('[]')) {
    const itemType = type.slice(0, -2);
    return {
      label,
      type,
      kind: 'array',
      children: (value || []).map((item, index) =>
        buildNode(
          String(index),
          itemType,
          item,
          typedData,
          tokenAddress,
          nowMs
        )
      ),
    };
  }

  const structFields = typedData.types?.[type] as TypedField[];
  if (Array.isArray(structFields)) {
    return {
      label,
      type,
      kind: 'object',
      children: buildStructNodes(
        structFields,
        value,
        typedData,
        tokenAddress,
        nowMs
      ),
    };
  }

  if (label === 'token' && type === 'address') {
    return { label, type, kind: 'token', rawValue: value, tokenAddress: value };
  }

  if (AMOUNT_FIELDS.has(label)) {
    return {
      label,
      type,
      kind: 'amount',
      rawValue: value,
      displayValue: String(value),
      tokenAddress,
    };
  }

  if (DATE_FIELDS.has(label)) {
    return {
      label,
      type,
      kind: 'date',
      rawValue: value,
      timestamp: formatPermitTimestamp(value, type, nowMs),
    };
  }

  if (type === 'address') {
    return { label, type, kind: 'address', rawValue: value };
  }

  if (type === 'bool') {
    return {
      label,
      type,
      kind: 'boolean',
      rawValue: value,
      displayValue: String(value),
    };
  }

  return {
    label,
    type,
    kind: 'primitive',
    rawValue: value,
    displayValue: String(value),
  };
}

function formatUtcDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    '-',
    pad(date.getUTCMonth() + 1),
    '-',
    pad(date.getUTCDate()),
    ' ',
    pad(date.getUTCHours()),
    ':',
    pad(date.getUTCMinutes()),
    ':',
    pad(date.getUTCSeconds()),
  ].join('');
}
