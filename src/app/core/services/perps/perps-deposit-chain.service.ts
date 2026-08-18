import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import {
  PerpsDepositConfig,
  PERPS_CHAIN_MAX_RETRIES,
  PERPS_CHAIN_REQUEST_TIMEOUT_MS,
  PERPS_CHAIN_RETRY_BASE_MS,
} from '@popup/_lib/perps';

/** The bridge is funded by a plain transfer; nothing else is called on it. */
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

/**
 * Why a deposit-chain call did not produce an answer.
 *
 * `unavailable` means no endpoint would answer — the question is still open and
 * the screen must say so rather than render a zero. `rejected` means an
 * endpoint answered and the answer was no, which is a fact worth showing.
 */
export type PerpsChainFailure = 'unavailable' | 'rejected';

export class PerpsChainError extends Error {
  constructor(readonly failure: PerpsChainFailure, message: string) {
    super(message);
    this.name = 'PerpsChainError';
  }
}

/**
 * Transient transport failures, taken from MetaMask's `RpcService`: connection
 * failures, truncated or non-JSON responses, gateway-class 5xx, timeouts and
 * connection resets. Everything else is an answer, not a hiccup, and retrying
 * it just asks a settled question again.
 */
const RETRIABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVER_ERROR',
]);

const RETRIABLE_STATUSES = new Set([502, 503, 504]);

const RETRIABLE_MESSAGES = [
  'network error',
  'failed to fetch',
  'networkerror when attempting to fetch resource',
  'the network connection was lost',
  'connection closed',
  'load failed',
];

@Injectable({ providedIn: 'root' })
export class PerpsDepositChainService {
  private providers = new Map<string, ethers.JsonRpcProvider>();

  /** Exact token balance, or a `PerpsChainError` when nobody would answer. */
  async tokenBalanceExact(
    config: PerpsDepositConfig,
    address: string
  ): Promise<string> {
    return this.withEndpoint(config, async (provider) => {
      const token = new ethers.Contract(config.address, ERC20_ABI, provider);
      const balance = await token.balanceOf(address);
      return ethers.formatUnits(balance, config.decimals);
    });
  }

  /** Native balance on the deposit chain — what actually pays for the gas. */
  async nativeBalanceExact(
    config: PerpsDepositConfig,
    address: string
  ): Promise<string> {
    return this.withEndpoint(config, async (provider) => {
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    });
  }

  /**
   * What the deposit transaction will cost, in the chain's native currency.
   *
   * Estimated against the real call rather than assumed: a hardcoded figure is
   * a guess presented as a fact, and on a rollup the true cost moves with the
   * L1 data fee.
   */
  async transferFeeExact(
    config: PerpsDepositConfig,
    from: string,
    amountExact: string
  ): Promise<string> {
    return this.withEndpoint(config, async (provider) => {
      const token = new ethers.Contract(config.address, ERC20_ABI, provider);
      const value = ethers.parseUnits(amountExact, config.decimals);
      const gasLimit = await token.transfer.estimateGas(
        config.bridgeAddress,
        value,
        { from }
      );
      const feeData = await provider.getFeeData();
      const perGas = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (perGas === null || perGas === undefined) {
        throw new PerpsChainError('unavailable', 'No gas price available');
      }
      return ethers.formatEther(gasLimit * perGas);
    });
  }

  /** Broadcast the deposit and return its hash; it is not yet confirmed. */
  async sendDeposit(
    config: PerpsDepositConfig,
    privateKey: string,
    amountExact: string
  ): Promise<string> {
    return this.withEndpoint(config, async (provider) => {
      const signer = new ethers.Wallet(privateKey, provider);
      const token = new ethers.Contract(config.address, ERC20_ABI, signer);
      const transaction = await token.transfer(
        config.bridgeAddress,
        ethers.parseUnits(amountExact, config.decimals)
      );
      return transaction.hash as string;
    });
  }

  /**
   * Whether the transaction has been mined, within the caller's patience.
   *
   * Returning `false` says only that it has not confirmed yet — the deposit is
   * broadcast and may still land, so the caller must treat this as pending
   * rather than failed.
   */
  async isConfirmed(
    config: PerpsDepositConfig,
    hash: string,
    timeoutMs: number
  ): Promise<boolean> {
    try {
      const receipt = await this.withEndpoint(config, (provider) =>
        provider.waitForTransaction(hash, 1, timeoutMs)
      );
      return !!receipt;
    } catch (error) {
      if (error instanceof PerpsChainError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Run against each endpoint in turn, retrying only transport failures.
   *
   * These endpoints are the product's own choice rather than a network the user
   * configured, so moving to the next one does not swap out a node they picked.
   */
  private async withEndpoint<T>(
    config: PerpsDepositConfig,
    run: (provider: ethers.JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    for (const url of config.rpcUrls) {
      const provider = this.providerFor(config, url);
      for (let attempt = 0; attempt <= PERPS_CHAIN_MAX_RETRIES; attempt++) {
        try {
          return await run(provider);
        } catch (error) {
          lastError = error;
          if (!isRetriable(error)) {
            throw new PerpsChainError(
              'rejected',
              (error as Error)?.message || 'Deposit chain call failed'
            );
          }
          if (attempt < PERPS_CHAIN_MAX_RETRIES) {
            await delay(PERPS_CHAIN_RETRY_BASE_MS * 2 ** attempt);
          }
        }
      }
    }
    throw new PerpsChainError(
      'unavailable',
      (lastError as Error)?.message || 'No deposit chain endpoint responded'
    );
  }

  private providerFor(
    config: PerpsDepositConfig,
    url: string
  ): ethers.JsonRpcProvider {
    const key = `${config.chainId}:${url}`;
    let provider = this.providers.get(key);
    if (!provider) {
      const request = new ethers.FetchRequest(url);
      request.timeout = PERPS_CHAIN_REQUEST_TIMEOUT_MS;
      // Pinning the network stops ethers probing chain id on every call, and
      // makes a mismatched endpoint fail loudly instead of quietly serving
      // another chain's state.
      const network = new ethers.Network(config.chainName, config.chainId);
      provider = new ethers.JsonRpcProvider(request, network, {
        staticNetwork: network,
      });
      this.providers.set(key, provider);
    }
    return provider;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriable(error: any): boolean {
  // Offline is a settled answer, not a hiccup: retrying cannot help and only
  // delays telling the user what is actually wrong.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  if (error instanceof PerpsChainError) {
    return false;
  }
  if (RETRIABLE_CODES.has(error?.code)) {
    return true;
  }
  const status = Number(
    error?.status ?? error?.info?.responseStatus?.toString?.().slice(0, 3)
  );
  if (RETRIABLE_STATUSES.has(status)) {
    return true;
  }
  const message = String(error?.message || '').toLowerCase();
  return RETRIABLE_MESSAGES.some((text) => message.includes(text));
}

/** Whether an exact decimal covers another, without passing through Number. */
export function coversExact(
  available: string | null,
  required: string | null
): boolean {
  if (available === null || required === null) {
    return false;
  }
  const have = new BigNumber(available);
  const need = new BigNumber(required);
  return have.isFinite() && need.isFinite() && have.isGreaterThanOrEqualTo(need);
}
