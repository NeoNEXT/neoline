import { EvmTransactionParams, TokenStandard } from '@/app/popup/_lib';
import { ethers } from 'ethers';

const PERMIT2_ADDRESS = '0x000000000022d473030f116ddee9f6b43ac78ba3';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_UINT256 = (2n ** 256n - 1n).toString();
const permitInterface = new ethers.Interface([
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
  'function permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed,uint8 v,bytes32 r,bytes32 s)',
]);
const permit2Interface = new ethers.Interface([
  'function permit(address owner,((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permitSingle,bytes signature)',
  'function permit(address owner,((address token,uint160 amount,uint48 expiration,uint48 nonce)[] details,address spender,uint256 sigDeadline) permitBatch,bytes signature)',
]);

export type EvmAuthorizationKind =
  | 'approve'
  | 'approveAndCall'
  | 'setApprovalForAll'
  | 'permit'
  | 'permit2';

export interface EvmAuthorizationDetails {
  kind: EvmAuthorizationKind;
  owner?: string;
  spender?: string;
  tokenAddress?: string;
  amount?: string;
  amountRaw?: string;
  tokenId?: string;
  deadline?: string;
  approved?: boolean;
  unlimited?: boolean;
  callsSpender?: boolean;
  scope?: 'token' | 'allNfts';
}

interface AssetDetails {
  standard?: TokenStandard;
  tokenAmount?: string;
  tokenId?: string;
}

export function getTransactionAuthorizations(
  txParams: EvmTransactionParams,
  tokenData?: any,
  assetDetails?: AssetDetails,
): EvmAuthorizationDetails[] {
  const method = String(tokenData?.name || '').toLowerCase();
  const args = tokenData?.args || [];
  if (method === 'approve' || method === 'approveandcall') {
    const isNft = assetDetails?.standard === TokenStandard.ERC721;
    const spender = getArg(args, '_spender', '_approved', 0);
    const amountRaw = isNft
      ? undefined
      : getArg(args, '_value', 'value', 1);
    const tokenId = isNft
      ? assetDetails?.tokenId || getArg(args, '_tokenId', 'tokenId', 1)
      : undefined;
    return [
      {
        kind: method === 'approveandcall' ? 'approveAndCall' : 'approve',
        owner: txParams.from,
        spender,
        tokenAddress: txParams.to,
        amount: isNft
          ? undefined
          : assetDetails?.tokenAmount || amountRaw,
        amountRaw,
        tokenId,
        approved: isNft
          ? !isZeroAddress(spender)
          : amountRaw === undefined
            ? undefined
            : !isZeroAmount(amountRaw),
        unlimited: !isNft && isMaxUint256(amountRaw),
        callsSpender: method === 'approveandcall',
        scope: isNft ? 'token' : undefined,
      },
    ];
  }
  if (method === 'setapprovalforall') {
    return [
      {
        kind: 'setApprovalForAll',
        owner: txParams.from,
        spender: getArg(args, '_operator', 'operator', 0),
        tokenAddress: txParams.to,
        approved: getBooleanArg(args, '_approved', 'approved', 1),
        scope: 'allNfts',
      },
    ];
  }

  return parsePermitTransaction(txParams);
}

export function getTypedDataAuthorizations(
  typedData: any,
  signerAddress?: string,
): EvmAuthorizationDetails[] {
  const primaryType = String(typedData?.primaryType || '').toLowerCase();
  const message = typedData?.message || {};
  const verifyingContract = String(
    typedData?.domain?.verifyingContract || '',
  ).toLowerCase();
  const isPermit2 =
    verifyingContract === PERMIT2_ADDRESS ||
    [
      'permitsingle',
      'permitbatch',
      'permittransferfrom',
      'permitbatchtransferfrom',
      'permitwitnesstransferfrom',
      'permitbatchwitnesstransferfrom',
    ].includes(primaryType);

  if (isPermit2) {
    const details = toArray(message.details || message.permitted);
    return details.map((detail) => ({
      kind: 'permit2',
      owner: message.owner || signerAddress,
      spender: message.spender,
      tokenAddress: detail?.token,
      amount: stringify(detail?.amount),
      deadline: stringify(
        message.sigDeadline ||
          message.deadline ||
          detail?.expiration ||
          message.expiration,
      ),
    }));
  }

  if (primaryType.includes('permit')) {
    return [
      {
        kind: 'permit',
        owner: message.owner || message.holder || signerAddress,
        spender: message.spender,
        tokenAddress: typedData?.domain?.verifyingContract,
        amount: stringify(message.value ?? message.amount),
        deadline: stringify(message.deadline ?? message.expiry),
        approved:
          typeof message.allowed === 'boolean' ? message.allowed : undefined,
      },
    ];
  }

  return [];
}

function parsePermitTransaction(
  txParams: EvmTransactionParams,
): EvmAuthorizationDetails[] {
  if (!txParams.data) {
    return [];
  }
  if (txParams.to?.toLowerCase() === PERMIT2_ADDRESS) {
    try {
      const parsed = permit2Interface.parseTransaction({ data: txParams.data });
      if (!parsed) {
        return [];
      }
      const permit =
        parsed.args.permitSingle || parsed.args.permitBatch || parsed.args[1];
      const details = toPermitDetails(permit.details ?? permit[0]);
      return details.map((detail) => ({
        kind: 'permit2',
        owner: parsed.args.owner || parsed.args[0],
        spender: permit.spender || permit[1],
        tokenAddress: detail.token || detail[0],
        amount: stringify(detail.amount ?? detail[1]),
        deadline: stringify(
          permit.sigDeadline ?? permit[2] ?? detail.expiration ?? detail[2],
        ),
      }));
    } catch {
      return [];
    }
  }

  try {
    const parsed = permitInterface.parseTransaction({ data: txParams.data });
    if (!parsed) {
      return [];
    }
    const isAllowedPermit = parsed.fragment.inputs.some(
      (input) => input.name === 'allowed',
    );
    return [
      {
        kind: 'permit',
        owner: parsed.args.owner || parsed.args.holder,
        spender: parsed.args.spender,
        tokenAddress: txParams.to,
        amount: isAllowedPermit ? undefined : stringify(parsed.args.value),
        deadline: stringify(parsed.args.deadline || parsed.args.expiry),
        approved: isAllowedPermit ? parsed.args.allowed : undefined,
      },
    ];
  } catch {
    return [];
  }
}

function getArg(
  args: any,
  primaryName: string,
  secondaryName: string,
  index: number,
): string | undefined {
  return stringify(args?.[primaryName] ?? args?.[secondaryName] ?? args?.[index]);
}

function getBooleanArg(
  args: any,
  primaryName: string,
  secondaryName: string,
  index: number,
): boolean {
  return Boolean(
    args?.[primaryName] ?? args?.[secondaryName] ?? args?.[index],
  );
}

function stringify(value: any): string | undefined {
  return value === undefined || value === null ? undefined : value.toString();
}

function isZeroAddress(value?: string): boolean {
  return value?.toLowerCase() === ZERO_ADDRESS;
}

function isZeroAmount(value?: string): boolean {
  const normalized = normalizeNumericString(value);
  return normalized === '0';
}

function isMaxUint256(value?: string): boolean {
  const normalized = normalizeNumericString(value);
  return normalized === MAX_UINT256;
}

function normalizeNumericString(value?: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return BigInt(value).toString();
  } catch {
    return undefined;
  }
}

function toArray(value: any): any[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function toPermitDetails(value: any): any[] {
  if (!Array.isArray(value)) {
    return value ? [value] : [];
  }
  if (!value.length) {
    return [];
  }
  return Array.isArray(value[0]) ? value : [value];
}
