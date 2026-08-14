import { Encoder } from '@msgpack/msgpack';
import { ethers } from 'ethers';

import { PerpsSignature } from '@popup/_lib/perps';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const USER_SIGNATURE_CHAIN_ID = 421614;

const L1_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: ZERO_ADDRESS,
};

const USER_DOMAIN = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: USER_SIGNATURE_CHAIN_ID,
  verifyingContract: ZERO_ADDRESS,
};

const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

const WITHDRAW_TYPES = {
  'HyperliquidTransaction:Withdraw': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'time', type: 'uint64' },
  ],
};

const USD_CLASS_TRANSFER_TYPES = {
  'HyperliquidTransaction:UsdClassTransfer': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'toPerp', type: 'bool' },
    { name: 'nonce', type: 'uint64' },
  ],
};

const APPROVE_BUILDER_FEE_TYPES = {
  'HyperliquidTransaction:ApproveBuilderFee': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'maxFeeRate', type: 'string' },
    { name: 'builder', type: 'address' },
    { name: 'nonce', type: 'uint64' },
  ],
};

function nonceBytes(nonce: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let value = nonce;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    bytes[index] = value % 256;
    value = Math.floor(value / 256);
  }
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

/**
 * @msgpack/msgpack 2.x cannot encode bigint. Patch only its integer dispatch so
 * protocol uint64 values survive; every other value continues through the
 * library's normal encoder.
 *
 * msgpack integers must use the narrowest format that holds the value — that is
 * what the official Python SDK emits and what the exchange re-encodes before
 * checking the signature, so widening an order id to 0xcf would change the
 * action hash and the recovered signer with it. Anything a double can hold
 * exactly therefore goes back through the library's own minimal encoder; only
 * values above 2^53 need the explicit uint64, which is already their narrowest
 * form.
 */
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MIN_INT64 = -(1n << 63n);
const MAX_UINT64 = (1n << 64n) - 1n;

function encodeHyperliquidAction(action: any): Uint8Array {
  const encoder = new Encoder() as any;
  const encodeNormally = encoder.doEncode.bind(encoder);
  encoder.doEncode = (object: unknown, depth: number): void => {
    if (typeof object === 'bigint') {
      if (object < MIN_INT64 || object > MAX_UINT64) {
        throw new RangeError('Hyperliquid integer is out of range');
      }
      if (object >= MIN_SAFE_BIGINT && object <= MAX_SAFE_BIGINT) {
        encodeNormally(Number(object), depth);
        return;
      }
      if (object < 0n) {
        encoder.writeU8(0xd3);
        encoder.ensureBufferSizeToWrite(8);
        encoder.view.setBigInt64(encoder.pos, object);
        encoder.pos += 8;
        return;
      }
      encoder.writeU8(0xcf);
      encoder.ensureBufferSizeToWrite(8);
      encoder.view.setBigUint64(encoder.pos, object);
      encoder.pos += 8;
      return;
    }
    encodeNormally(object, depth);
  };
  return encoder.encode(action);
}

/**
 * Hash an L1 action exactly as the official Python SDK does:
 * msgpack(action) || uint64(nonce) || no-vault marker.
 */
export function hyperliquidActionHash(
  action: any,
  nonce: number
): string {
  return ethers.keccak256(
    concatBytes(
      encodeHyperliquidAction(action),
      nonceBytes(nonce),
      new Uint8Array([0])
    )
  );
}

function splitSignature(signature: string): PerpsSignature {
  const parsed = ethers.Signature.from(signature);
  return {
    r: parsed.r,
    s: parsed.s,
    v: parsed.v,
  };
}

export async function signHyperliquidL1Action(
  privateKey: string,
  action: any,
  nonce: number,
  isMainnet: boolean
): Promise<PerpsSignature> {
  const connectionId = hyperliquidActionHash(action, nonce);
  const signature = await new ethers.Wallet(privateKey).signTypedData(
    L1_DOMAIN,
    AGENT_TYPES,
    {
      source: isMainnet ? 'a' : 'b',
      connectionId,
    }
  );
  return splitSignature(signature);
}

export interface SignedWithdrawAction {
  action: {
    type: 'withdraw3';
    signatureChainId: string;
    hyperliquidChain: 'Mainnet' | 'Testnet';
    destination: string;
    amount: string;
    time: number;
  };
  signature: PerpsSignature;
}

export async function signHyperliquidWithdraw(
  privateKey: string,
  destination: string,
  amount: string,
  nonce: number,
  isMainnet: boolean
): Promise<SignedWithdrawAction> {
  const action: SignedWithdrawAction['action'] = {
    type: 'withdraw3',
    signatureChainId: ethers.toQuantity(USER_SIGNATURE_CHAIN_ID),
    hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
    destination: destination.toLowerCase(),
    amount,
    time: nonce,
  };
  const signature = await new ethers.Wallet(privateKey).signTypedData(
    USER_DOMAIN,
    WITHDRAW_TYPES,
    action
  );
  return { action, signature: splitSignature(signature) };
}

/**
 * Authorise a builder to charge up to `maxFeeRate` on this account's orders.
 *
 * The rate is a percentage string ("0.045%") and the approval is a ceiling, not
 * a fixed price: signing it lets the builder attach any fee up to that rate to
 * later orders. It is signed once per account and stays in force until replaced.
 */
export async function signHyperliquidApproveBuilderFee(
  privateKey: string,
  builder: string,
  maxFeeRate: string,
  nonce: number,
  isMainnet: boolean
): Promise<{ action: any; signature: PerpsSignature }> {
  const action = {
    type: 'approveBuilderFee',
    signatureChainId: ethers.toQuantity(USER_SIGNATURE_CHAIN_ID),
    hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
    maxFeeRate,
    builder: builder.toLowerCase(),
    nonce,
  };
  const signature = await new ethers.Wallet(privateKey).signTypedData(
    USER_DOMAIN,
    APPROVE_BUILDER_FEE_TYPES,
    action
  );
  return { action, signature: splitSignature(signature) };
}

export async function signHyperliquidUsdClassTransfer(
  privateKey: string,
  amount: string,
  toPerp: boolean,
  nonce: number,
  isMainnet: boolean
): Promise<{ action: any; signature: PerpsSignature }> {
  const action = {
    type: 'usdClassTransfer',
    signatureChainId: ethers.toQuantity(USER_SIGNATURE_CHAIN_ID),
    hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
    amount,
    toPerp,
    nonce,
  };
  const signature = await new ethers.Wallet(privateKey).signTypedData(
    USER_DOMAIN,
    USD_CLASS_TRANSFER_TYPES,
    action
  );
  return { action, signature: splitSignature(signature) };
}
