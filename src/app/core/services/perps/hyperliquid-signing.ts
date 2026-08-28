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
 * 这里的提现是一次携带 hook data 的 Core→EVM 转账，不是旧的跨桥提现。`data` 是动态
 * 类型，因此它的 EIP-712 编码是字节的哈希而不是字节本身 —— 若按字符串签名，会产生一个
 * 看起来合法、却恢复出错误地址的签名。
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
 * @msgpack/msgpack 2.x 无法编码 bigint。这里只给它的整数分发打补丁，好让协议里的
 * uint64 值得以保全；其余所有值继续走库自己的编码器。
 *
 * msgpack 整数必须使用能容纳该值的最窄格式 —— 官方 Python SDK 输出的就是这种格式，
 * 交易场所在校验签名前重新编码时用的也是它，所以把一个订单 id 加宽成 0xcf 会改变
 * action 哈希，连带改变恢复出的签名者。因此凡是双精度浮点能精确表示的值，都交回库
 * 自己的最小编码器；只有超过 2^53 的值才需要显式的 uint64，而那本来就是它们最窄的形式。
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
 * 完全按官方 Python SDK 的方式对 L1 action 做哈希：
 * msgpack(action) || uint64(nonce) || 无 vault 标记。
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
 * 提现从哪个 HyperCore 余额扣款：`''` 是永续余额，`'spot'` 是现货余额。两者不可互换 ——
 * 标准账户把它们当作两个独立钱包，而统一账户的 USDC 全部放在现货侧，此时永续清算所报出
 * 的数字被文档称为「无意义」（无论账户有多少资金，那里的 `withdrawable` 都是 0）。
 * 来源：https://developers.circle.com/cctp/howtos/withdraw-usdc-from-hypercore-to-evm
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
 * 把 USDC 从 HyperCore 提到另一条链上的同一地址。
 *
 * `sourceDex` 指明交易场所扣款的余额，由调用方决定：它必须与账户的抽象模式相符，而且
 * 两个取值互相都不是安全的默认值。`data` 留空，因为正是空值告诉转发器自行完成 mint。
 * `data` 里放任何别的东西都会变成用户自带的 hook data：转发费不再生效，这条消息还得由
 * 目的链上第一个到场的人去认领。
 *
 * `destinationChainId` 是 CCTP domain（Arbitrum 为 3），不是 EVM 链 id。Circle 的
 * CoreDepositWallet natspec 和 sendToEvmWithData 指南都是这么写的；坑在 ABI 的命名上。
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
 * 授权某个 builder 对本账户的订单最多收取 `maxFeeRate` 的费用。
 *
 * 该费率是百分比字符串（"0.045%"），且这次授权是上限而非固定价格：签署之后，builder
 * 可以给后续订单附加不超过该费率的任意手续费。它每个账户只签一次，在被替换之前一直有效。
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
