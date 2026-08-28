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
  PERPS_CORE_USER_EXISTS_PRECOMPILE,
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
  'function newCoreAccountFee() view returns (uint64)',
]);

/** HyperCore 按 8 位小数计数，而 USDC 的 EVM 侧按 6 位。 */
const CORE_DECIMALS = 8;

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
 * 这条通道两侧都是按次定价的 —— Circle 通过 HTTP 报出入金费，而提现费是一个合约变量、
 * 其 owner 可以修改 —— 所以报价会在签名前重新读取并比对，而不是相信它一段时间。这个数字
 * 是上限：实际 mint 可能收得更少，因此到账金额只会好于估算。
 */
export interface PerpsFeeQuote {
  /** 这条通道从转账中扣走的全部费用 —— 展示给用户的就是这个数。 */
  feeExact: string;
  /**
   * 其中属于 CCTP 的那部分，也是唯一可以作为 `maxFee` 传出去的部分。
   *
   * 它与 `feeExact` 不是同一个数：一笔入金的通道费还可能包含 Circle 的开户费，而那笔钱
   * 是在 CCTP 早已完成之后，由 `CoreDepositWallet` 在 HyperCore 那一段收走的。把它当作
   * `maxFee` 交给 CCTP，等于授权它拿走一笔谁也没打算给它的钱。
   */
  maxFeeExact: string;
}

@Injectable({ providedIn: 'root' })
export class PerpsFeeQuoteService {
  private readonly isTestnet = resolvePerpsTestnet(environment.perpsNetwork);

  constructor(
    private http: HttpClient,
    private rpc: PerpsRpcService
  ) {}

  /**
   * 一笔 `amountExact` 的入金里，CCTP 会扣走多少。
   *
   * 之所以需要金额，是因为答案由两部分组成：一笔固定的转发费，以及一笔按基点报价的协议
   * 费。后者目前在这条通道上是零 —— 而这恰恰是要算它而不是假定它的理由：读出来的零是
   * 事实，跳过不读的零只是猜测。
   */
  async depositQuote(
    amountExact: string,
    recipient: string
  ): Promise<PerpsFeeQuote> {
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

    const amount = new BigNumber(amountExact);
    if (!amount.isFinite()) {
      throw new PerpsChainError(
        'rejected',
        'Cannot quote a fee for this amount'
      );
    }

    // 向上取整：报价是承诺给用户的上限，所以不足一个最小单位的零头必须由产品这边承担，
    // 而不是落到用户头上。
    const protocolFee = amount
      .times(bps)
      .div(10000)
      .decimalPlaces(USDC_DECIMALS, BigNumber.ROUND_CEIL);

    const account = await this.newAccountFeeExact(recipient);
    // 只含 CCTP 自己的收费，别的都不含：它按基点报出的协议费，
    // 加上它在 mint 时收取的转发费。
    const cctpFee = protocolFee.plus(forward.shiftedBy(-USDC_DECIMALS));

    return {
      feeExact: cctpFee.plus(account).toFixed(),
      maxFeeExact: cctpFee.toFixed(),
    };
  }

  /**
   * Circle 为「入账到一个尚不存在的账户」所收的费用。
   *
   * 目前两个网络上都是零，但仍然照读不误：它是一个合约变量，owner 随时可以打开，而且它
   * 是从入金实际入账的金额里扣的。它被合并进同一份报价而不是单独展示 —— 告诉用户的是
   * 这条通道的总成本，而不是哪个合约拿走了其中哪一份。
   *
   * 不要与 Hyperliquid 的一次性开户费混淆，本合约明确不收那笔费用，也没有任何界面报告它。
   */
  private async newAccountFeeExact(recipient: string): Promise<string> {
    const evm = this.hyperEvmConfig;
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return this.rpc.withEndpoint(evm, async (provider) => {
      const [exists] = coder.decode(
        ['bool'],
        await provider.call({
          to: PERPS_CORE_USER_EXISTS_PRECOMPILE,
          data: coder.encode(['address'], [recipient]),
        })
      ) as unknown as [boolean];
      if (exists) {
        return '0';
      }
      const [fee] = CORE_DEPOSIT_WALLET.decodeFunctionResult(
        'newCoreAccountFee',
        await provider.call({
          to: evm.coreDepositWallet,
          data: CORE_DEPOSIT_WALLET.encodeFunctionData('newCoreAccountFee'),
        })
      ) as unknown as [bigint];
      return ethers.formatUnits(fee, CORE_DECIMALS);
    });
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
    return { feeExact, maxFeeExact: feeExact };
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
