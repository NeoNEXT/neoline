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
 * Deposits that have left the wallet but are not yet spendable.
 *
 * A bridge deposit is two facts arriving minutes apart — the transfer is on
 * chain, and the bridge has credited it — and the popup can close between them.
 * Without this record the second half of the operation would simply vanish from
 * the interface, leaving the user to wonder whether their money went anywhere.
 *
 * The store is scoped to perps: clearing it never touches the wallet's own
 * Neo2, Neo3 or NeoX state.
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

  /** Pending deposits for one address on one chain, oldest first. */
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
   * Whether this deposit has been followed for as long as it is worth following.
   *
   * Reaching the limit is not a failure and does not delete the record: the
   * transfer is on chain and may still be credited, so what the user needs is
   * the transaction hash and an honest "not credited yet", not a cleared screen.
   */
  isStalled(deposit: PerpsPendingDeposit, now = Date.now()): boolean {
    return now - deposit.startedAt >= PERPS_PENDING_DEPOSIT_MAX_MS;
  }

  /**
   * Whether the account has risen above where it stood before this deposit.
   *
   * The exchange offers no per-deposit receipt, so the credit is recognised by
   * the balance it produces. A rise from some other cause would also clear the
   * record, which is harmless: either way the money the user is waiting on is
   * no longer missing.
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
