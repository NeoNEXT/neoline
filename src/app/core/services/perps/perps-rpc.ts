import { Injectable } from '@angular/core';
import { ethers } from 'ethers';

import {
  PERPS_CHAIN_MAX_RETRIES,
  PERPS_CHAIN_REQUEST_TIMEOUT_MS,
  PERPS_CHAIN_RETRY_BASE_MS,
} from '@popup/_lib/perps';

/**
 * 一次链上调用为什么没有得到答案。
 *
 * `unavailable` 表示没有任何端点作答 —— 问题仍然悬着，界面必须如实说明，而不是渲染成
 * 零。`rejected` 表示某个端点作答了，答案是「不行」，这是一个值得展示的事实。
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

/** 产品会读取的一条链，以及它可以轮换使用的端点。 */
export interface PerpsRpcEndpoints {
  chainId: number;
  chainName: string;
  /**
   * 这条链的端点，按顺序依次尝试。
   *
   * 与钱包网络上的 RPC 列表不同，这些端点从来不是用户选的：这些链只是资金通道的实现
   * 细节，因此从一个失效端点轮换走并不等于替换掉用户挑选的节点。每个条目都必须服务于
   * 同一个链 id，使用前会做校验。
   */
  rpcUrls: string[];
}

/**
 * 临时性的传输故障，取自 MetaMask 的 `RpcService`：连接失败、被截断或非 JSON 的响应、
 * 网关类 5xx、超时以及连接重置。除此之外的一切都是答案而不是打嗝，重试它只是把一个已有
 * 定论的问题再问一遍。
 *
 * `SERVER_ERROR` 被刻意排除在外。ethers 对每一个非 2xx 响应以及真正的传输故障都抛这个
 * 码，所以单凭这个码就接受，会把端点已经回答过的问题重新问一遍 —— 而且会让下面的状态码
 * 列表永远走不到。它改为按所携带的状态码来分类。
 */
const RETRIABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'TIMEOUT',
  'NETWORK_ERROR',
]);

/**
 * 超过自身截止时间的请求，按名字识别而不是按错误码。
 *
 * ethers 把它的超时报成上面的 `TIMEOUT` 码，但手续费报价走的是 `HttpClient`，由 rxjs
 * `timeout` 限定，抛出的 `TimeoutError` 既没有 code 也没有 status。如果不认识它，它就会
 * 被读成一个有定论的答案，于是这条策略最该重试的那种失败，反而会被报告成 Circle 拒绝了
 * 请求。
 */
const RETRIABLE_ERROR_NAMES = new Set(['TimeoutError']);

const RETRIABLE_STATUSES = new Set([502, 503, 504]);

/**
 * 解析不了的响应体属于传输被截断，而不是一个答案。
 *
 * ethers 在它的 JSON getter 里以 `UNSUPPORTED_OPERATION` 抛出这个错误，随之带上的状态码
 * 很可能是 200，所以它按错误信息识别，并且要在任何状态码判断之前先检查。
 */
const MALFORMED_BODY_MESSAGES = [
  'response body is not valid json',
  'invalid json',
  'unexpected end of json',
];

/**
 * 端点声称自己已经持有这笔交易，这算成功：字节与上面签过的那一份完全相同，
 * 所以它知道的那笔交易就是这一笔。
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
 * 资金通道读取的所有链共用一套重试策略。
 *
 * 入金链和 HyperEVM 遵守同一条规则 —— 重试传输故障，绝不重试业务答案，离线时绝不重试
 * —— 而把这条规则抄成两份，正是其中一份悄悄不再遵守它的方式。
 */
@Injectable({ providedIn: 'root' })
export class PerpsRpcService {
  private providers = new Map<string, ethers.JsonRpcProvider>();

  /**
   * 向第一个作答的端点发起一次读取。
   *
   * `run` 可能被执行很多次 —— 每次重试一次、每个端点一次 —— 所以它必须可以安全重复。
   * 任何会改变状态的操作都属于 `broadcast`，那里被重复的是一组固定的已签名字节。
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
   * 把一笔已经签好名的交易发到链上。
   *
   * 签名只发生一次，在这次调用之前，所以这里的每次尝试提交的都是完全相同的字节：轮换到
   * 另一个端点、或者重试一次丢失的响应，都只可能重复提交同一笔交易。把签名放进重试循环
   * 里，才是把一次丢失的响应变成第二笔入金的原因 —— 因为每次尝试都会用当时读到的 nonce
   * 生成一笔新交易。
   *
   * 哈希由那些字节推导而来，而不是取自回复，因此即使没有回复到达也能知道它。
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
      // 固定网络可以让 ethers 不必在每次调用时探测链 id，也让链 id 不匹配的端点大声
      // 失败，而不是悄悄提供另一条链的状态。
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
  // 离线是一个有定论的答案，不是打嗝：重试帮不上忙，只会推迟告诉用户真正的问题是什么。
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
    // 没有任何回应。ethers 和 Angular 都用这种方式报告一个从未抵达服务器的请求，
    // 它是「回复的缺席」而不是拒绝 —— 这恰恰是下面的状态码列表不该插手的情形。
    return true;
  }
  if (status !== null) {
    // 有服务器作答了。只有网关类的答复才意味着「再问一次」；带响应体的 500，
    // 以及所有 4xx，都是有定论的回复。
    return RETRIABLE_STATUSES.has(status);
  }
  if (error?.code === 'SERVER_ERROR') {
    // 同一个错误码，背后却什么都没有：这是 ethers 在描述一个从未抵达服务器的请求。
    // 那属于连接失败，而这正是本策略存在的意义所在。
    return true;
  }
  return RETRIABLE_MESSAGES.some((text) => message.includes(text));
}

/** 端点是否因为已经持有这笔完全相同的交易而拒绝了广播。 */
export function isAlreadyBroadcast(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return ALREADY_BROADCAST_MESSAGES.some((text) => message.includes(text));
}

/**
 * 错误背后的 HTTP 状态码；不携带状态码时返回 null。
 *
 * 状态 `0` 会如实报出而不是丢弃：ethers 和 Angular 都用它描述一个从未抵达服务器的请求，
 * 调用方必须能把它和一个完全不提状态码的错误区分开。除此之外小于 100 的值两者都不是，
 * 一律按「没有状态码」处理。
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
