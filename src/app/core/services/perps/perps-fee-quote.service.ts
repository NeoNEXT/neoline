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

/** USDC everywhere on this route: both quotes are read and returned at 6dp. */
const USDC_DECIMALS = 6;

/**
 * The only function this product calls on `CoreDepositWallet`.
 *
 * Deliberately not the `cctpForwardFees` mapping beside it: whether a chain has
 * an override is decided by `isCctpForwardFeeSet`, and Arbitrum has none, so
 * reading the mapping returns zero and would quote a free withdrawal. Keeping
 * the interface to one function makes that mistake unavailable rather than
 * merely discouraged.
 */
const CORE_DEPOSIT_WALLET = new ethers.Interface([
  'function calculateCrossChainWithdrawalFee(bool shouldForward, uint32 destinationChainId) view returns (uint256)',
  'function newCoreAccountFee() view returns (uint64)',
]);

/** HyperCore counts in 8 decimals where the EVM side of USDC counts in 6. */
const CORE_DECIMALS = 8;

/** What Circle's fee endpoint answers, per finality threshold. */
interface CctpFeeEntry {
  finalityThreshold: number;
  /** Protocol fee in basis points of the amount; zero on this route today. */
  minimumFee: number;
  /** Flat forwarding fee in USDC subunits. Currently one static value in all three. */
  forwardFee?: { low: number; med: number; high: number };
}

/**
 * A fee read at a point in time, never a constant.
 *
 * Both sides of this route price per operation — Circle quotes the deposit over
 * HTTP, and the withdrawal fee is a contract variable its owner can change — so
 * a quote is read again before signing and compared, rather than trusted for a
 * while. The figure is a ceiling: the mint may take less, so the amount that
 * arrives can only beat the estimate.
 */
export interface PerpsFeeQuote {
  /** Everything the route takes out of the transfer — what the user is shown. */
  feeExact: string;
  /**
   * The part of it that belongs to CCTP, and the only part that may be passed
   * as `maxFee`.
   *
   * Not the same number as `feeExact`: a deposit's route fee can also include
   * Circle's new-account charge, which `CoreDepositWallet` takes on the
   * HyperCore leg long after CCTP is done. Handing that to CCTP as `maxFee`
   * would authorise it to take an amount nobody intended it to have.
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
   * What CCTP will take out of a deposit of `amountExact`.
   *
   * The amount is needed because the answer has two parts: a flat forwarding
   * fee, and a protocol fee quoted in basis points. The second is zero on this
   * route today, which is exactly why it is computed rather than assumed —
   * a zero that is read is a fact, a zero that is skipped is a guess.
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

    // Rounded up: the quote is what the user is promised as a ceiling, so a
    // fraction of a subunit has to fall on the product's side, not theirs.
    const protocolFee = amount
      .times(bps)
      .div(10000)
      .decimalPlaces(USDC_DECIMALS, BigNumber.ROUND_CEIL);

    const account = await this.newAccountFeeExact(recipient);
    // CCTP's own charges, and nothing else: the protocol fee it quotes in basis
    // points plus the forwarding fee it collects at the mint.
    const cctpFee = protocolFee.plus(forward.shiftedBy(-USDC_DECIMALS));

    return {
      feeExact: cctpFee.plus(account).toFixed(),
      maxFeeExact: cctpFee.toFixed(),
    };
  }

  /**
   * Circle's own charge for crediting an account that does not exist yet.
   *
   * Zero on both networks today, and read anyway: it is a contract variable its
   * owner can switch on, and it comes out of what the deposit credits. Folded
   * into the same quote rather than shown separately — the user is told what
   * the route costs, not which contract took which part of it.
   *
   * Not to be confused with Hyperliquid's one-time activation fee, which this
   * contract explicitly does not collect and which no interface reports.
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

  /** What the withdrawal route will take, read from the contract that decides it. */
  async withdrawQuote(): Promise<PerpsFeeQuote> {
    const evm = this.hyperEvmConfig;
    // Solidity names this argument `destinationChainId`; Circle's natspec says
    // the value is the CCTP domain of the destination, not the EVM chain id.
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

    // The contract computes its own `maxFee` and this is that number, so the
    // route fee and the CCTP ceiling are one and the same here.
    const feeExact = ethers.formatUnits(fee, USDC_DECIMALS);
    return { feeExact, maxFeeExact: feeExact };
  }

  /**
   * The smallest withdrawal worth signing, at twice the quote.
   *
   * Below one times the quote the destination chain reverts, and it reverts
   * after HyperCore has already been debited. The second multiple is the room
   * between reading the quote and the contract acting on it, during which the
   * owner can raise the fee.
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
        // Classified by the same policy the chain reads use: a timeout and a
        // response that never arrived are the transport failing, not Circle
        // answering, and a second copy of that rule here is how this path would
        // quietly stop following it.
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
