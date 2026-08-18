/**
 * Account-scoped nonce allocation for Hyperliquid write actions.
 *
 * In memory, and deliberately not persisted — see
 * `docs/adr/0002-no-local-nonce-persistence.md`. Hyperliquid validates a nonce
 * against the hundred highest it has seen for that signer plus a time window,
 * not against this client's history, so the authoritative floor lives at the
 * exchange and cannot be reconstructed here. The one problem this allocator can
 * actually solve is two of our own writes landing in the same millisecond.
 *
 * It has no Angular dependency on purpose: the same instance has to move into
 * the background trade executor once that exists, and be shared by every window.
 */
export class PerpsNonceAllocator {
  private last = new Map<string, number>();

  /** Next nonce for `account`, never equal to one this allocator already gave it. */
  next(account: string): number {
    const key = (account || '').toLowerCase();
    const previous = this.last.get(key) ?? 0;
    const nonce = Math.max(Date.now(), previous + 1);
    this.last.set(key, nonce);
    return nonce;
  }

  /** Forget an account's allocations — used when its wallet is removed. */
  forget(account: string) {
    this.last.delete((account || '').toLowerCase());
  }
}

/**
 * Whether the exchange refused an action because of its nonce.
 *
 * A refusal is a settled answer: nothing was executed, so re-signing with a
 * fresh nonce cannot duplicate anything. That is the opposite of a lost
 * response, where the action may well have run and a retry would send it twice.
 * Matching on the word is deliberate — Hyperliquid returns prose here, and the
 * failure mode of matching too narrowly (a real nonce refusal surfacing as a
 * bare "action failed") is worse than of matching too broadly.
 */
export function isNonceRejection(error: unknown): boolean {
  const message =
    typeof error === 'string' ? error : (error as Error)?.message || '';
  return /nonce/i.test(message);
}
