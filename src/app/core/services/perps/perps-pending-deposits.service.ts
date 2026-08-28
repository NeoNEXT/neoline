import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';
import { firstValueFrom } from 'rxjs';

import { ChromeService } from '../chrome.service';
import { STORAGE_NAME } from '@popup/_lib';
import {
  PerpsPendingDeposit,
  PERPS_PENDING_DEPOSIT_MAX_MS,
} from '@popup/_lib/perps';

/**
 * 已经离开钱包、但还不能动用的入金。
 *
 * 一笔跨桥入金是相隔几分钟到达的两个事实 —— 转账已上链、桥已入账 —— 而弹窗可能在这
 * 两者之间关闭。没有这份记录，操作的后半段就会从界面上凭空消失，只剩用户纳闷自己的钱
 * 到底去哪了。
 *
 * 这个存储的作用域限于 perps：清空它绝不会碰到钱包自身的 Neo2、Neo3 或 NeoX 状态。
 */
@Injectable({ providedIn: 'root' })
export class PerpsPendingDepositsService {
  constructor(private chrome: ChromeService) {}

  async list(): Promise<PerpsPendingDeposit[]> {
    const stored = await firstValueFrom(
      this.chrome.getStorage(STORAGE_NAME.perpsPendingDeposits)
    );
    return Array.isArray(stored) ? (stored as PerpsPendingDeposit[]) : [];
  }

  /** 某条链上某个地址的待入账入金，最早的在前。 */
  async listFor(address: string, chainId: number): Promise<PerpsPendingDeposit[]> {
    const all = await this.list();
    const user = (address || '').toLowerCase();
    return all
      .filter(
        (item) =>
          item.chainId === chainId && item.address?.toLowerCase() === user
      )
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  async add(deposit: PerpsPendingDeposit) {
    const all = await this.list();
    await this.save([
      ...all.filter((item) => item.hash !== deposit.hash),
      deposit,
    ]);
  }

  async update(hash: string, changes: Partial<PerpsPendingDeposit>) {
    const all = await this.list();
    await this.save(
      all.map((item) => (item.hash === hash ? { ...item, ...changes } : item))
    );
  }

  async remove(hash: string) {
    const all = await this.list();
    await this.save(all.filter((item) => item.hash !== hash));
  }

  /**
   * 这笔入金是否已经跟踪到了值得跟踪的时长上限。
   *
   * 到达上限不算失败，也不会删除记录：转账已经上链，仍有可能被入账，所以用户需要的是
   * 交易哈希和一句诚实的「尚未入账」，而不是一片被清空的界面。
   */
  isStalled(deposit: PerpsPendingDeposit, now = Date.now()): boolean {
    return now - deposit.startedAt >= PERPS_PENDING_DEPOSIT_MAX_MS;
  }

  /**
   * 账户是否已经升到高于这笔入金发生之前的水平。
   *
   * 交易场所不提供逐笔入金的回执，所以入账是靠它带来的余额变化来识别的。由其他原因造成
   * 的上涨同样会清掉这条记录，这没有害处：无论哪种情况，用户等待的那笔钱都已经不再缺失。
   */
  isCredited(
    deposit: PerpsPendingDeposit,
    withdrawableExact: string | null
  ): boolean {
    if (withdrawableExact === null || withdrawableExact === undefined) {
      return false;
    }
    const now = new BigNumber(withdrawableExact);
    const before = new BigNumber(deposit.withdrawableBeforeExact ?? 0);
    return now.isFinite() && before.isFinite() && now.isGreaterThan(before);
  }

  private async save(deposits: PerpsPendingDeposit[]) {
    this.chrome.setStorage(STORAGE_NAME.perpsPendingDeposits, deposits);
  }
}
