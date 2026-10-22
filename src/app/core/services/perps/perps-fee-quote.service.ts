import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';
import { firstValueFrom, timeout } from 'rxjs';

import { environment } from '@/environments/environment';
import {
  PERPS_CCTP_FEE_API,
  PERPS_CCTP_FINALITY_FAST,
  PERPS_CCTP_HYPEREVM_DOMAIN,
  PERPS_CHAIN_MAX_RETRIES,
  PERPS_CHAIN_REQUEST_TIMEOUT_MS,
  PERPS_CHAIN_RETRY_BASE_MS,
  PERPS_DEPOSIT_CONFIG,
  PERPS_HYPEREVM_CONFIG,
  resolvePerpsTestnet,
} from '@popup/_lib/perps';
import {
  delay,
  isRetriable,
  PerpsChainError,
  PerpsRpcService,
} from './perps-rpc';

/** 这条通道上处处都是 USDC：两侧报价都按 6 位小数读取和返回。 */
const USDC_DECIMALS = 6;

/**
 * 本产品在 `CoreDepositWallet` 上唯一调用的函数。
 *
 * 刻意不用它旁边的 `cctpForwardFees` 映射：一条链是否有覆写由 `isCctpForwardFeeSet`
 * 决定，而 Arbitrum 没有，所以直接读映射会得到 0，进而报出一笔「免费提现」。把接口收窄
 * 到只有一个函数，让这个错误压根做不出来，而不只是「不推荐这么做」。
 */
const CORE_DEPOSIT_WALLET = new ethers.Interface([
  'function calculateCrossChainWithdrawalFee(bool shouldForward, uint32 destinationChainId) view returns (uint256)',
]);

/** Circle 手续费端点按最终性档位给出的答复。 */
interface CctpFeeEntry {
  finalityThreshold: number;
  /** 按金额基点计的协议费；目前这条通道上是零。 */
  minimumFee: number;
  /** 以 USDC 最小单位计的固定转发费。目前三档都是同一个静态值。 */
  forwardFee?: { low: number; med: number; high: number };
}

/**
 * 某个时点读到的手续费，绝不是常量。
 *
 * 进入资金页时读取：入金费率由 Circle HTTP 返回，提现手续费由合约返回。
 * 报价用于预计到账计算，最终扣费和到账仍以实际执行结果为准。
 */
export interface PerpsFeeQuote {
  /** 当前通道的手续费报价，用于展示及预计收到计算。 */
  feeExact: string;
}

export interface PerpsDepositFeeRate {
  protocolFeeBps: number;
  forwardFeeExact: string;
}

@Injectable({ providedIn: 'root' })
export class PerpsFeeQuoteService {
  private readonly isTestnet = resolvePerpsTestnet(environment.perpsNetwork);

  constructor(
    private http: HttpClient,
    private rpc: PerpsRpcService
  ) {}

  /** 读取入金协议费基点及以 USDC 计的固定转发费。 */
  async depositFeeRate(): Promise<PerpsDepositFeeRate> {
    const source = this.depositConfig.cctp.sourceDomain;
    const base = this.isTestnet
      ? PERPS_CCTP_FEE_API.testnet
      : PERPS_CCTP_FEE_API.mainnet;
    const url =
      `${base}/${source}/${PERPS_CCTP_HYPEREVM_DOMAIN}` +
      `?forward=true&hyperCoreDeposit=true`;

    const entries = await this.withRetry(() =>
      firstValueFrom(
        this.http
          .get<CctpFeeEntry[]>(url)
          .pipe(timeout(PERPS_CHAIN_REQUEST_TIMEOUT_MS))
      )
    );

    const fast = Array.isArray(entries)
      ? entries.find(
          (entry) => entry?.finalityThreshold === PERPS_CCTP_FINALITY_FAST
        )
      : undefined;
    if (!fast) {
      throw new PerpsChainError(
        'rejected',
        'Circle did not quote the fast transfer this deposit uses'
      );
    }

    const forward = new BigNumber(fast.forwardFee?.high ?? NaN);
    const bps = new BigNumber(fast.minimumFee ?? NaN);
    if (!forward.isFinite() || !bps.isFinite()) {
      throw new PerpsChainError('rejected', 'Circle quoted an unreadable fee');
    }

    return {
      protocolFeeBps: fast.minimumFee,
      forwardFeeExact: forward.shiftedBy(-USDC_DECIMALS).toFixed(),
    };
  }

  /** 提现通道会扣走多少，从决定这件事的那个合约里读出来。 */
  async withdrawQuote(): Promise<PerpsFeeQuote> {
    const evm = this.hyperEvmConfig;
    // Solidity 把这个参数命名为 `destinationChainId`；Circle 的 natspec 说这个值是目的地
    // 的 CCTP domain，而不是 EVM 链 id。
    const destinationDomain = this.depositConfig.cctp.sourceDomain;
    const data = CORE_DEPOSIT_WALLET.encodeFunctionData(
      'calculateCrossChainWithdrawalFee',
      [true, destinationDomain]
    );

    const raw = await this.rpc.withEndpoint(evm, (provider) =>
      provider.call({ to: evm.coreDepositWallet, data })
    );

    let fee: bigint;
    try {
      [fee] = CORE_DEPOSIT_WALLET.decodeFunctionResult(
        'calculateCrossChainWithdrawalFee',
        raw
      ) as unknown as [bigint];
    } catch (error) {
      throw new PerpsChainError(
        'rejected',
        'CoreDepositWallet returned an unreadable fee'
      );
    }

    // 合约自己算出它的 `maxFee`，而这就是那个数，所以这里通道费和 CCTP 上限是同一个东西。
    const feeExact = ethers.formatUnits(fee, USDC_DECIMALS);
    return { feeExact };
  }

  /**
   * 值得签名的最小提现额，取报价的两倍。
   *
   * 低于报价的一倍，目的链会 revert，而且是在 HyperCore 已经扣款之后才 revert。第二倍
   * 留出的是「读到报价」到「合约据此执行」之间的余量，在这段时间里 owner 可以上调费用。
   */
  minWithdrawExact(quote: PerpsFeeQuote): string {
    return new BigNumber(quote.feeExact).times(2).toFixed();
  }

  private async withRetry<T>(run: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= PERPS_CHAIN_MAX_RETRIES; attempt++) {
      try {
        return await run();
      } catch (error) {
        lastError = error;
        // 采用与链上读取相同的策略来分类：超时和从未到达的响应都是传输在出问题，而不是
        // Circle 在作答；在这里再抄一份那条规则，正是这条路径日后悄悄不再遵守它的方式。
        if (!isRetriable(error)) {
          throw new PerpsChainError(
            'rejected',
            (error as Error)?.message || 'Circle refused the fee request'
          );
        }
        if (attempt < PERPS_CHAIN_MAX_RETRIES) {
          await delay(PERPS_CHAIN_RETRY_BASE_MS * 2 ** attempt);
        }
      }
    }
    throw new PerpsChainError(
      'unavailable',
      (lastError as Error)?.message || 'Circle did not answer the fee request'
    );
  }

  private get depositConfig() {
    return this.isTestnet
      ? PERPS_DEPOSIT_CONFIG.testnet
      : PERPS_DEPOSIT_CONFIG.mainnet;
  }

  private get hyperEvmConfig() {
    return this.isTestnet
      ? PERPS_HYPEREVM_CONFIG.testnet
      : PERPS_HYPEREVM_CONFIG.mainnet;
  }
}
