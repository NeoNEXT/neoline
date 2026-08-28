import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import {
  PerpsDepositConfig,
  PERPS_CCTP_DEX_PERPS,
  PERPS_CCTP_FINALITY_FAST,
  PERPS_CCTP_HYPEREVM_DOMAIN,
  PERPS_DEPOSIT_AUTH_VALIDITY_SECONDS,
  PERPS_DEPOSIT_GAS_BUFFER,
  PERPS_HYPEREVM_CONFIG,
} from '@popup/_lib/perps';
import { PerpsChainError, PerpsRpcService } from './perps-rpc';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
];

/**
 * 一次调用完成整笔入金：扩展合约凭用户签署的授权把 USDC 拉走，并在同一笔交易里通过
 * CCTP 销毁它。`TokenMessengerV2` 本来需要的那次单独 approve，正是这个合约要省掉的东西。
 */
const CCTP_EXTENSION_ABI = [
  'function batchDepositForBurnWithAuth(' +
    '(uint256 amount,uint256 authValidAfter,uint256 authValidBefore,bytes32 authNonce,uint8 v,bytes32 r,bytes32 s) receiveWithAuthorizationData,' +
    '(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData) depositForBurnData' +
    ')',
];

const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/**
 * 一笔入金在源链上的结局。
 *
 * `pending` 不是失败，`reverted` 也不是延迟；界面必须能把它们分别说清楚。
 */
export type PerpsDepositOutcome = 'confirmed' | 'reverted' | 'pending';

/**
 * 一份已签名的许可，准许扩展合约恰好取走这一笔入金。
 *
 * 在估算手续费与广播之间，持有的是它而不是私钥：它只授权一个金额、一个合约、一段有限的
 * 时间，而且没法再变回私钥。
 */
export interface PerpsDepositAuthorization {
  from: string;
  amountExact: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
  v: number;
  r: string;
  s: string;
}

@Injectable({ providedIn: 'root' })
export class PerpsDepositChainService {
  constructor(private rpc: PerpsRpcService) {}

  /** 精确的代币余额；当没有任何端点作答时返回 `PerpsChainError`。 */
  async tokenBalanceExact(
    config: PerpsDepositConfig,
    address: string
  ): Promise<string> {
    return this.rpc.withEndpoint(config, async (provider) => {
      const token = new ethers.Contract(config.cctp.usdc, ERC20_ABI, provider);
      const balance = await token.balanceOf(address);
      return ethers.formatUnits(balance, config.decimals);
    });
  }

  /** 入金链上的原生代币余额 —— 真正用来付 gas 的就是它。 */
  async nativeBalanceExact(
    config: PerpsDepositConfig,
    address: string
  ): Promise<string> {
    return this.rpc.withEndpoint(config, async (provider) => {
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    });
  }

  /**
   * 签署这笔入金所依据的授权。
   *
   * 代币的 EIP-712 name 和 version 是从代币里读出来的，而不是假定的。任何一个搞错，都会
   * 产生一个被合约拒绝的签名，最终在广播时表现为一次莫名其妙的失败；把它们读出来，就把
   * 那种失败变成了一个普通的「链不可达」错误。
   */
  async authorizeDeposit(
    config: PerpsDepositConfig,
    privateKey: string,
    amountExact: string
  ): Promise<PerpsDepositAuthorization> {
    const wallet = new ethers.Wallet(privateKey);
    const value = ethers.parseUnits(amountExact, config.decimals);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const message = {
      from: wallet.address,
      to: config.cctp.extension,
      value,
      validAfter: 0,
      validBefore: nowSeconds + PERPS_DEPOSIT_AUTH_VALIDITY_SECONDS,
      nonce: ethers.hexlify(ethers.randomBytes(32)),
    };

    const domain = await this.rpc.withEndpoint(config, async (provider) => {
      const token = new ethers.Contract(config.cctp.usdc, ERC20_ABI, provider);
      const [name, version] = await Promise.all([
        token.name(),
        token.version(),
      ]);
      return {
        name,
        version,
        chainId: config.chainId,
        verifyingContract: config.cctp.usdc,
      };
    });

    const signature = ethers.Signature.from(
      await wallet.signTypedData(
        domain,
        RECEIVE_WITH_AUTHORIZATION_TYPES,
        message
      )
    );

    return {
      from: wallet.address,
      amountExact,
      validAfter: message.validAfter,
      validBefore: message.validBefore,
      nonce: message.nonce,
      v: signature.v,
      r: signature.r,
      s: signature.s,
    };
  }

  /**
   * 这笔入金以链自身货币计的成本上限。
   *
   * 针对真实调用做估算而不是拍脑袋 —— 在 rollup 上真实成本会随 L1 数据费浮动 —— 然后
   * 按 Circle 自己示例里同样的 20% 上浮，因为「一次授权加一次外部调用」的估算余量很紧，
   * 而 gas 耗尽的入金照样会烧掉已经花出去的部分。带缓冲的上限既是实际发出去的值，也是
   * 展示给用户的值。
   */
  async depositFeeExact(
    config: PerpsDepositConfig,
    authorization: PerpsDepositAuthorization,
    maxFeeExact: string
  ): Promise<string> {
    return this.rpc.withEndpoint(config, async (provider) => {
      const extension = new ethers.Contract(
        config.cctp.extension,
        CCTP_EXTENSION_ABI,
        provider
      );
      const gasLimit = await extension.batchDepositForBurnWithAuth.estimateGas(
        ...this.callArguments(config, authorization, maxFeeExact),
        { from: authorization.from }
      );
      const feeData = await provider.getFeeData();
      const perGas = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (perGas === null || perGas === undefined) {
        throw new PerpsChainError('unavailable', 'No gas price available');
      }
      return ethers.formatEther(this.bufferedGas(gasLimit) * perGas);
    });
  }

  /**
   * 广播这笔入金并返回它的哈希；此时尚未确认。
   *
   * 只签一次名，之后作为固定字节发送。底下的端点轮换和重试是为读取准备的，若把写操作
   * 直接交给它们，每次尝试都会重新签名：节点已经接受交易之后丢失的那次响应，会以用户
   * USDC 的第二次销毁的形式回来。把 nonce 和手续费钉进同一个签名里，可以让每一次重发都
   * 是同一笔交易 —— 节点要么已经有它，要么还没见过它。
   */
  async sendDeposit(
    config: PerpsDepositConfig,
    privateKey: string,
    authorization: PerpsDepositAuthorization,
    maxFeeExact: string
  ): Promise<string> {
    const signed = await this.rpc.withEndpoint(config, async (provider) => {
      const signer = new ethers.Wallet(privateKey, provider);
      const extension = new ethers.Contract(
        config.cctp.extension,
        CCTP_EXTENSION_ABI,
        signer
      );
      const args = this.callArguments(config, authorization, maxFeeExact);
      const request =
        await extension.batchDepositForBurnWithAuth.populateTransaction(...args);
      request.gasLimit = this.bufferedGas(
        await extension.batchDepositForBurnWithAuth.estimateGas(...args, {
          from: authorization.from,
        })
      );
      return signer.signTransaction(await signer.populateTransaction(request));
    });
    return this.rpc.broadcast(config, signed);
  }

  /**
   * 在调用方愿意等待的时间内，这笔入金交易在源链上究竟做成了什么。
   *
   * 三种结果，因为把它们压成两种会丢掉最要紧的那一种。`pending` 只说明它还没确认 ——
   * 入金已经广播，仍有可能落块。`reverted` 恰恰相反：一份状态为失败的回执是有定论的
   * 答案，USDC 从未被销毁，HyperCore 那边的入账也永远不会来。仅凭「有回执」就判定成功，
   * 会让一笔已经 revert 的入金陷入对一笔不可能到来的入账的无尽等待。
   */
  async depositOutcome(
    config: PerpsDepositConfig,
    hash: string,
    timeoutMs: number
  ): Promise<PerpsDepositOutcome> {
    try {
      const receipt = await this.rpc.withEndpoint(config, (provider) =>
        provider.waitForTransaction(hash, 1, timeoutMs)
      );
      if (!receipt) {
        return 'pending';
      }
      return receipt.status === 1 ? 'confirmed' : 'reverted';
    } catch (error) {
      if (error instanceof PerpsChainError) {
        return 'pending';
      }
      throw error;
    }
  }

  /**
   * 调用扩展合约时传入的两个结构体。
   *
   * `mintRecipient` 和 `destinationCaller` 都是 HyperEVM 上的转发器，绝不是用户本人：
   * mint 到转发器，再由它依据 hook data 给用户的 HyperCore 账户入账。这两者中任何一个
   * 指向别处，都会让这笔钱永久搁浅。
   */
  private callArguments(
    config: PerpsDepositConfig,
    authorization: PerpsDepositAuthorization,
    maxFeeExact: string
  ) {
    const forwarder = ethers.zeroPadValue(
      this.hyperEvmFor(config).cctpForwarder,
      32
    );
    const amount = ethers.parseUnits(
      authorization.amountExact,
      config.decimals
    );
    return [
      {
        amount,
        authValidAfter: authorization.validAfter,
        authValidBefore: authorization.validBefore,
        authNonce: authorization.nonce,
        v: authorization.v,
        r: authorization.r,
        s: authorization.s,
      },
      {
        amount,
        destinationDomain: PERPS_CCTP_HYPEREVM_DOMAIN,
        mintRecipient: forwarder,
        destinationCaller: forwarder,
        maxFee: ethers.parseUnits(maxFeeExact, config.decimals),
        minFinalityThreshold: PERPS_CCTP_FINALITY_FAST,
        hookData: encodeForwardHookData(authorization.from),
      },
    ] as const;
  }

  private bufferedGas(estimate: bigint): bigint {
    // 以十分之一为单位保存，这样像 1.15 这样的缓冲系数就不必经由 Number 转成 BigInt。
    const tenths = new BigNumber(PERPS_DEPOSIT_GAS_BUFFER).times(10);
    if (!tenths.isInteger() || !tenths.isPositive()) {
      throw new Error('PERPS_DEPOSIT_GAS_BUFFER must be a positive multiple of 0.1');
    }
    return (estimate * BigInt(tenths.toFixed())) / 10n;
  }

  /**
   * 属于这条入金链的 HyperEVM 一侧。
   *
   * 显式匹配，匹配不上就拒绝，而不是退回到其中某一个：这里选定的转发器地址会成为 mint
   * 的收款方，而在一次主网销毁里写上测试网转发器，会把真金白银的 USDC 送到谁也取不回来
   * 的地方。
   */
  private hyperEvmFor(config: PerpsDepositConfig) {
    const paired = Object.values(PERPS_HYPEREVM_CONFIG).find(
      (candidate) => candidate.pairedDepositChainId === config.chainId
    );
    if (!paired) {
      throw new PerpsChainError(
        'rejected',
        `No HyperEVM forwarder is paired with chain ${config.chainId}`
      );
    }
    return paired;
  }
}

/**
 * 告诉转发器该给哪个 HyperCore 账户入账的 hook data。
 *
 * 布局来自 Circle：24 字节的 `cctp-forward` 标记、一个版本号、后续内容的长度、收款方，
 * 以及要入账到哪个 HyperCore 余额。这里只会写永续余额。
 */
export function encodeForwardHookData(
  recipient: string,
  destinationDex: number = PERPS_CCTP_DEX_PERPS
): string {
  const magic = ethers
    .hexlify(ethers.toUtf8Bytes('cctp-forward'))
    .slice(2)
    .padEnd(48, '0');
  const version = '00000000';
  const dataLength = (24).toString(16).padStart(8, '0');
  const address = recipient.slice(2).toLowerCase();
  const dex = (destinationDex >>> 0).toString(16).padStart(8, '0');
  return `0x${magic}${version}${dataLength}${address}${dex}`;
}

/** 一个精确十进制是否覆盖得住另一个，全程不经过 Number。 */
export function coversExact(
  available: string | null,
  required: string | null
): boolean {
  if (available === null || required === null) {
    return false;
  }
  const have = new BigNumber(available);
  const need = new BigNumber(required);
  return (
    have.isFinite() && need.isFinite() && have.isGreaterThanOrEqualTo(need)
  );
}
