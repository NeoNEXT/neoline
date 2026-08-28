/**
 * Hyperliquid 写操作的账户级 nonce 分配。
 *
 * 只存在于内存中，且刻意不做持久化 —— 见
 * `docs/adr/0002-no-local-nonce-persistence.md`。Hyperliquid 校验 nonce 时，比对的是
 * 它为该签名者见过的最高一百个 nonce 加上一个时间窗口，而不是本客户端的历史；
 * 权威下界因此在交易场所那边，这里无法重建。这个分配器真正能解决的问题只有一个：
 * 我们自己的两次写入落在同一毫秒。
 *
 * 它刻意不依赖 Angular：等后台交易执行器出现后，同一个实例要挪进去，并被所有窗口共享。
 */
export class PerpsNonceAllocator {
  private last = new Map<string, number>();

  /** `account` 的下一个 nonce，绝不等于本分配器已经给过它的值。 */
  next(account: string): number {
    const key = (account || '').toLowerCase();
    const previous = this.last.get(key) ?? 0;
    const nonce = Math.max(Date.now(), previous + 1);
    this.last.set(key, nonce);
    return nonce;
  }

  /** 清除某个账户的分配记录 —— 该钱包被移除时使用。 */
  forget(account: string) {
    this.last.delete((account || '').toLowerCase());
  }
}

/**
 * 交易场所是否因为 nonce 而拒绝了某个操作。
 *
 * 拒绝是一个已经确定的答案：什么都没有执行，所以用新 nonce 重新签名不会造成重复。
 * 这与响应丢失正好相反 —— 那种情况下操作很可能已经执行，重试会把它发送两次。
 * 这里按关键词匹配是刻意的：Hyperliquid 在这里返回的是自然语言，而匹配过窄的后果
 *（真正的 nonce 拒绝以一句干巴巴的 "action failed" 呈现）比匹配过宽更糟。
 */
export function isNonceRejection(error: unknown): boolean {
  const message =
    typeof error === 'string' ? error : (error as Error)?.message || '';
  return /nonce/i.test(message);
}
