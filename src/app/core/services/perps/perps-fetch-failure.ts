import { HttpErrorResponse } from '@angular/common/http';
import { MonoTypeOperatorFunction, throwError, timer } from 'rxjs';
import { retry } from 'rxjs/operators';

/**
 * 区分「被拒绝」和「回复根本没到」。
 *
 * 这个区分决定两件不同的事 —— 一次写入的结果是否已知，以及一次读取是否值得重来 ——
 * 所以在这里写一次，两边共用。
 */

/**
 * 一次失败的写入是否带回了交易场所的答复。
 *
 * 读取响应过程中抛出的任何错误，按定义都算答复 —— 响应体到了，内容是「不行」。
 * `HttpErrorResponse` 只有在状态码表示交易场所自己发出的拒绝时才算答复：4xx 是请求
 * 还没执行就被拒绝，而 5xx 或状态码为 0 说明请求可能已经收到并执行，只是回复在返程
 * 中丢了。
 */
export function isExchangeAnswer(error: any): boolean {
  const transport =
    error instanceof HttpErrorResponse || error?.name === 'HttpErrorResponse';
  if (!transport) {
    return true;
  }
  const status = Number(error?.status);
  return Number.isFinite(status) && status >= 400 && status < 500;
}

/**
 * 一次失败的读取是否值得重来。
 *
 * 和 `isExchangeAnswer` 对写入所做的分类是同一件事，只是换一侧来看。如果交易场所
 * 答复了，这次读取就已经拿到结果，再问一次得到的还是同一个：4xx 是拒绝 —— 包括限流，
 * 此时秒级重试只会从一个要到接下来一分钟才补满的额度里再花掉一个名额 —— 而一个已经
 * 到达却解析失败的响应体，再解析一次还是会失败。如果它没有答复，领域内什么都没被
 * 决定，这个请求值得原样重发。
 */
export function isTransientFetchFailure(error: any): boolean {
  return !isExchangeAnswer(error);
}

/**
 * 一次只读请求在「失败即是答案」之前重复多少次。
 *
 * 有上限且间隔均匀是刻意的。指数退避属于那种一分钟后还在跑的进程；这里属于用户正盯
 * 着看的弹窗，所以整个预算要花在用户本来就愿意为一个页面等待的时间之内，然后就停。
 * 这里没有任何东西会在之后自我重排 —— 下一次尝试是用户的下一个动作。
 */
export const FETCH_RETRY_ATTEMPTS = 3;
export const FETCH_RETRY_DELAY_MS = 1000;

/** 只要失败还没有回答任何问题，就重复这次只读请求。 */
export function retryTransientFetch<T>(): MonoTypeOperatorFunction<T> {
  return retry({
    count: FETCH_RETRY_ATTEMPTS,
    delay: (error) =>
      isTransientFetchFailure(error)
        ? timer(FETCH_RETRY_DELAY_MS)
        : throwError(() => error),
  });
}
