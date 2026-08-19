import { Injectable } from '@angular/core';
import { ethers } from 'ethers';

import {
  PERPS_CHAIN_MAX_RETRIES,
  PERPS_CHAIN_REQUEST_TIMEOUT_MS,
  PERPS_CHAIN_RETRY_BASE_MS,
} from '@popup/_lib/perps';

/**
 * Why a chain call did not produce an answer.
 *
 * `unavailable` means no endpoint would answer — the question is still open and
 * the screen must say so rather than render a zero. `rejected` means an
 * endpoint answered and the answer was no, which is a fact worth showing.
 */
export type PerpsChainFailure = 'unavailable' | 'rejected';

export class PerpsChainError extends Error {
  constructor(
    readonly failure: PerpsChainFailure,
    message: string
  ) {
    super(message);
    this.name = 'PerpsChainError';
  }
}

/** A chain the product reads from, and the endpoints it may rotate between. */
export interface PerpsRpcEndpoints {
  chainId: number;
  chainName: string;
  /**
   * Endpoints for this chain, tried in order.
   *
   * Unlike the RPC list on a wallet network, the user never chose these: these
   * chains are an implementation detail of the funding route, so rotating away
   * from a dead endpoint is not swapping out a node the user picked. Every
   * entry must serve the same chain id, which is checked before use.
   */
  rpcUrls: string[];
}

/**
 * Transient transport failures, taken from MetaMask's `RpcService`: connection
 * failures, truncated or non-JSON responses, gateway-class 5xx, timeouts and
 * connection resets. Everything else is an answer, not a hiccup, and retrying
 * it just asks a settled question again.
 *
 * `SERVER_ERROR` is deliberately absent. ethers raises it for every non-2xx
 * response as well as for genuine transport failures, so accepting the code on
 * its own re-asks questions the endpoint has already answered — and leaves the
 * status list below unreachable. It is classified by the status it carries.
 */
const RETRIABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'TIMEOUT',
  'NETWORK_ERROR',
]);

/**
 * A request that outlived its own deadline, named rather than coded.
 *
 * ethers reports its timeout as the `TIMEOUT` code above, but the fee quote
 * goes out over `HttpClient` and is bounded by rxjs `timeout`, which raises a
 * `TimeoutError` carrying no code and no status. Left unrecognised it reads as
 * a settled answer, so the one failure this policy most exists to retry would
 * be reported to the user as Circle refusing the request.
 */
const RETRIABLE_ERROR_NAMES = new Set(['TimeoutError']);

const RETRIABLE_STATUSES = new Set([502, 503, 504]);

/**
 * A body that did not parse is a truncated transfer rather than an answer.
 *
 * ethers raises this from its JSON getter as `UNSUPPORTED_OPERATION`, and the
 * status that came with it may well be a 200, so it is recognised by message
 * and checked before any status.
 */
const MALFORMED_BODY_MESSAGES = [
  'response body is not valid json',
  'invalid json',
  'unexpected end of json',
];

/**
 * An endpoint saying it already holds this transaction is a success: the bytes
 * are identical to the ones signed once above, so the transaction it knows
 * about is this one.
 */
const ALREADY_BROADCAST_MESSAGES = [
  'already known',
  'already imported',
  'known transaction',
  'duplicate transaction',
  'transaction already exists',
];

const RETRIABLE_MESSAGES = [
  'network error',
  'failed to fetch',
  'networkerror when attempting to fetch resource',
  'the network connection was lost',
  'connection closed',
  'load failed',
];

/**
 * One retry policy for every chain the funding route reads.
 *
 * Both the deposit chain and HyperEVM are subject to the same rule — retry
 * transport failures, never a business answer, never while offline — and two
 * copies of that rule is how one of them quietly stops following it.
 */
@Injectable({ providedIn: 'root' })
export class PerpsRpcService {
  private providers = new Map<string, ethers.JsonRpcProvider>();

  /**
   * Run a read against the first endpoint that answers.
   *
   * `run` may be executed many times — once per retry, once per endpoint — so
   * it must be safe to repeat. Anything that changes state belongs in
   * `broadcast`, where what gets repeated is a fixed set of signed bytes.
   */
  async withEndpoint<T>(
    endpoints: PerpsRpcEndpoints,
    run: (provider: ethers.JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    for (const url of endpoints.rpcUrls) {
      const provider = this.providerFor(endpoints, url);
      for (let attempt = 0; attempt <= PERPS_CHAIN_MAX_RETRIES; attempt++) {
        try {
          return await run(provider);
        } catch (error) {
          lastError = error;
          if (!isRetriable(error)) {
            throw new PerpsChainError(
              'rejected',
              (error as Error)?.message ||
                `${endpoints.chainName} call was refused`
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
      (lastError as Error)?.message ||
        `No ${endpoints.chainName} endpoint responded`
    );
  }

  /**
   * Put an already-signed transaction on chain.
   *
   * Signing happens once, before this call, so every attempt here submits the
   * identical bytes: rotating to another endpoint or retrying a lost response
   * can only ever resubmit the same transaction. Signing inside the retry loop
   * is what turns one lost response into a second deposit, because each attempt
   * would author a new transaction with whatever nonce it read at the time.
   *
   * The hash is derived from those bytes rather than from the reply, so it is
   * known even when no reply arrives.
   */
  async broadcast(
    endpoints: PerpsRpcEndpoints,
    signedTransaction: string
  ): Promise<string> {
    const hash = ethers.keccak256(signedTransaction);
    try {
      await this.withEndpoint(endpoints, (provider) =>
        provider.broadcastTransaction(signedTransaction)
      );
    } catch (error) {
      if (!isAlreadyBroadcast(error)) {
        throw error;
      }
    }
    return hash;
  }

  private providerFor(
    endpoints: PerpsRpcEndpoints,
    url: string
  ): ethers.JsonRpcProvider {
    const key = `${endpoints.chainId}:${url}`;
    let provider = this.providers.get(key);
    if (!provider) {
      const request = new ethers.FetchRequest(url);
      request.timeout = PERPS_CHAIN_REQUEST_TIMEOUT_MS;
      // Pinning the network stops ethers probing chain id on every call, and
      // makes a mismatched endpoint fail loudly instead of quietly serving
      // another chain's state.
      const network = new ethers.Network(
        endpoints.chainName,
        endpoints.chainId
      );
      provider = new ethers.JsonRpcProvider(request, network, {
        staticNetwork: network,
      });
      this.providers.set(key, provider);
    }
    return provider;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetriable(error: any): boolean {
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
  if (RETRIABLE_ERROR_NAMES.has(error?.name)) {
    return true;
  }
  const message = String(error?.message || '').toLowerCase();
  if (MALFORMED_BODY_MESSAGES.some((text) => message.includes(text))) {
    return true;
  }
  const status = httpStatus(error);
  if (status === 0) {
    // Nothing answered. ethers and Angular both report a request that never
    // reached a server this way, and it is the absence of a reply rather than
    // a refusal — the one case the status list below must not decide.
    return true;
  }
  if (status !== null) {
    // A server answered. Only the gateway-class answers mean "ask again"; a 500
    // carrying a response body, and every 4xx, is a settled reply.
    return RETRIABLE_STATUSES.has(status);
  }
  if (error?.code === 'SERVER_ERROR') {
    // The same code, with nothing behind it: ethers describing a request that
    // never reached a server. That is a connection failure, which is exactly
    // what this policy exists to retry.
    return true;
  }
  return RETRIABLE_MESSAGES.some((text) => message.includes(text));
}

/** Whether an endpoint refused a broadcast because it already has this exact transaction. */
export function isAlreadyBroadcast(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return ALREADY_BROADCAST_MESSAGES.some((text) => message.includes(text));
}

/**
 * The HTTP status behind an error, or null when it carries none.
 *
 * Status `0` is reported rather than discarded: it is how both ethers and
 * Angular describe a request that never reached a server, and the caller has to
 * be able to tell that apart from an error that says nothing about status at
 * all. Anything else below 100 is neither, and is treated as no status.
 */
function httpStatus(error: any): number | null {
  const raw =
    error?.status ?? error?.response?.statusCode ?? error?.info?.responseStatus;
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }
  const status = Number(text.slice(0, 3));
  if (!Number.isFinite(status)) {
    return null;
  }
  return status >= 100 || status === 0 ? status : null;
}
