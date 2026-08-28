import { of } from 'rxjs';

import { PerpsPendingDepositsService } from './perps-pending-deposits.service';
import { PERPS_PENDING_DEPOSIT_MAX_MS } from '@popup/_lib/perps';

describe('PerpsPendingDepositsService', () => {
  let service: PerpsPendingDepositsService;
  let stored: any[];
  let chrome: any;

  const deposit = (overrides: any = {}) => ({
    chainId: 42161,
    address: '0xABC',
    amountExact: '50',
    hash: '0xhash',
    startedAt: Date.now(),
    chainConfirmed: false,
    withdrawableBeforeExact: '10',
    ...overrides,
  });

  beforeEach(() => {
    stored = [];
    chrome = {
      getStorage: () => of(stored),
      setStorage: (_name: string, value: any) => (stored = value),
    };
    service = new PerpsPendingDepositsService(chrome);
  });

  it('keeps a record per transaction and replaces rather than duplicates', async () => {
    await service.add(deposit());
    await service.add(deposit({ chainConfirmed: true }));

    const all = await service.list();
    expect(all.length).toBe(1);
    expect(all[0].chainConfirmed).toBeTrue();
  });

  it('never stores anything that could be replayed', async () => {
    await service.add(deposit());

    const record = (await service.list())[0];
    const text = JSON.stringify(record).toLowerCase();
    expect(text).not.toContain('key');
    expect(text).not.toContain('password');
    expect(Object.keys(record).sort()).toEqual([
      'address',
      'amountExact',
      'chainConfirmed',
      'chainId',
      'hash',
      'startedAt',
      'withdrawableBeforeExact',
    ]);
  });

  it('scopes records to one address on one chain', async () => {
    await service.add(deposit({ hash: '0x1' }));
    await service.add(deposit({ hash: '0x2', address: '0xother' }));
    await service.add(deposit({ hash: '0x3', chainId: 421614 }));

    const mine = await service.listFor('0xabc', 42161);
    expect(mine.map((item) => item.hash)).toEqual(['0x1']);
  });

  it('treats a risen withdrawable balance as the credit landing', () => {
    const item = deposit();
    expect(service.isCredited(item, '10')).toBeFalse();
    expect(service.isCredited(item, '60')).toBeTrue();
    // 余额未知，两个方向都证明不了。
    expect(service.isCredited(item, null)).toBeFalse();
  });

  it('stops following a deposit eventually, without deleting it', () => {
    const now = Date.now();
    const fresh = deposit({ startedAt: now });
    const old = deposit({ startedAt: now - PERPS_PENDING_DEPOSIT_MAX_MS - 1 });

    expect(service.isStalled(fresh, now)).toBeFalse();
    expect(service.isStalled(old, now)).toBeTrue();
  });
});
