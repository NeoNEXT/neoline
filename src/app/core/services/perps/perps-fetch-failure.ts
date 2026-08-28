import { HttpErrorResponse } from '@angular/common/http';
import { MonoTypeOperatorFunction, throwError, timer } from 'rxjs';
import { retry } from 'rxjs/operators';

/**
 * Telling a refusal apart from a reply that never arrived.
 *
 * The distinction decides two different things — whether a write's outcome is
 * known, and whether a read is worth repeating — so it is spelled once here
 * and read from both sides.
 */

/**
 * Whether a failed write carries an answer from the exchange.
 *
 * Anything thrown while reading a response is an answer by definition — the
 * body arrived and said no. An `HttpErrorResponse` is only an answer when its
 * status is a refusal the exchange itself issued: a 4xx rejects the request
 * before it runs, while a 5xx or a status of zero says the request may have
 * been received and executed with the reply lost on the way back.
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
 * Whether a failed read is worth repeating.
 *
 * The same classification `isExchangeAnswer` makes for writes, read from the
 * other side. If the exchange answered, the read has its result and asking
 * again returns the identical one: a 4xx is a refusal — rate limiting included,
 * where a second-scale retry only spends another slot out of a budget that
 * refills over the following minute — and a body that arrived and failed to
 * parse will fail to parse again. If it did not answer, nothing in the domain
 * was decided and the request is worth resending unchanged.
 */
export function isTransientFetchFailure(error: any): boolean {
  return !isExchangeAnswer(error);
}

/**
 * How many times a read-only fetch is repeated before its failure is the answer.
 *
 * Bounded and evenly spaced on purpose. Exponential backoff belongs to a
 * process that will still be running in a minute; this one belongs to a popup
 * the user is watching, so the budget is spent inside the time they are
 * already willing to wait for a page, and then it stops. Nothing here
 * reschedules itself afterwards — the next attempt is the user's next action.
 */
export const FETCH_RETRY_ATTEMPTS = 3;
export const FETCH_RETRY_DELAY_MS = 1000;

/** Repeat a read-only fetch while its failure has not answered anything. */
export function retryTransientFetch<T>(): MonoTypeOperatorFunction<T> {
  return retry({
    count: FETCH_RETRY_ATTEMPTS,
    delay: (error) =>
      isTransientFetchFailure(error)
        ? timer(FETCH_RETRY_DELAY_MS)
        : throwError(() => error),
  });
}
