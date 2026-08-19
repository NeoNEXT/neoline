import { Encoder } from '@msgpack/msgpack';
import { ethers } from 'ethers';

import {
  PerpsSignature,
  PERPS_CORE_TO_EVM_GAS_LIMIT,
} from '@popup/_lib/perps';

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

/**
 * The withdrawal is a Core-to-EVM transfer carrying hook data, not the old
 * bridge withdrawal. `data` is a dynamic type, so its EIP-712 encoding is the
 * hash of the bytes rather than the bytes themselves — signing it as a string
 * would produce a valid-looking signature that recovers to the wrong address.
 */
const SEND_TO_EVM_WITH_DATA_TYPES = {
  'HyperliquidTransaction:SendToEvmWithData': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'token', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'sourceDex', type: 'string' },
    { name: 'destinationRecipient', type: 'string' },
    { name: 'addressEncoding', type: 'string' },
    { name: 'destinationChainId', type: 'uint32' },
    { name: 'gasLimit', type: 'uint64' },
    { name: 'data', type: 'bytes' },
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

/**
 * Which HyperCore balance a withdrawal debits: `''` is the perps balance and
 * `'spot'` is the spot balance. The two are not interchangeable — a standard
 * account keeps them as separate wallets, and a unified account holds all of
 * its USDC in spot while the perps clearinghouse reports figures the docs call
 * not meaningful (`withdrawable` is 0 there however funded the account is).
 * SOURCE: https://developers.circle.com/cctp/howtos/withdraw-usdc-from-hypercore-to-evm
 */
export type PerpsWithdrawSourceDex = '' | 'spot';

export interface SignedSendToEvmWithDataAction {
  action: {
    type: 'sendToEvmWithData';
    signatureChainId: string;
    hyperliquidChain: 'Mainnet' | 'Testnet';
    token: string;
    amount: string;
    sourceDex: PerpsWithdrawSourceDex;
    destinationRecipient: string;
    addressEncoding: 'hex';
    destinationChainId: number;
    gasLimit: number;
    data: string;
    nonce: number;
  };
  signature: PerpsSignature;
}

/**
 * Withdraw USDC from HyperCore to the same address on another chain.
 *
 * `sourceDex` names the balance the exchange debits and belongs to the caller:
 * it has to match the account's abstraction mode, and neither value is a safe
 * default for the other. `data` is empty because that is what tells the
 * forwarder to deliver the mint on its own. Anything else in `data` becomes
 * user-supplied hook data: the forwarding fee stops being applied and the
 * message has to be claimed on the destination chain by whoever gets there
 * first.
 *
 * `destinationChainId` is the CCTP domain (3 for Arbitrum), not the EVM chain
 * id. Circle's CoreDepositWallet natspec and the sendToEvmWithData guide both
 * say so; the ABI name is the trap.
 */
export async function signHyperliquidSendToEvmWithData(
  privateKey: string,
  destinationRecipient: string,
  amount: string,
  destinationChainId: number,
  nonce: number,
  isMainnet: boolean,
  sourceDex: PerpsWithdrawSourceDex
): Promise<SignedSendToEvmWithDataAction> {
  const action: SignedSendToEvmWithDataAction['action'] = {
    type: 'sendToEvmWithData',
    signatureChainId: ethers.toQuantity(USER_SIGNATURE_CHAIN_ID),
    hyperliquidChain: isMainnet ? 'Mainnet' : 'Testnet',
    token: 'USDC',
    amount,
    sourceDex,
    destinationRecipient: destinationRecipient.toLowerCase(),
    addressEncoding: 'hex',
    destinationChainId,
    gasLimit: PERPS_CORE_TO_EVM_GAS_LIMIT,
    data: '0x',
    nonce,
  };
  const signature = await new ethers.Wallet(privateKey).signTypedData(
    USER_DOMAIN,
    SEND_TO_EVM_WITH_DATA_TYPES,
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
