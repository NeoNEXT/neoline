import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import {
  PerpsAccount,
  PerpsAccountState,
  PerpsAggregatedAccount,
  PerpsConnectionState,
} from '@popup/_lib/perps';
import { PerpsAccountStateService } from './perps-account-state.service';

const account = (
  dex = '',
  values: Partial<PerpsAccount> = {}
): PerpsAccount => ({
  unified: false,
  abstractionMode: 'default',
  dex,
  accountValueExact: '10',
  totalBalanceExact: '10',
  totalMarginUsedExact: '2',
  totalNtlPosExact: '20',
  marginRatioExact: '5',
  withdrawableExact: '8',
  availableBalanceExact: '8',
  spotUsdcExact: '0',
  spotUsdcHoldExact: '0',
  positions: [],
  ...values,
});

const clearinghouse = (value: string, dex = '') => ({
  user: '0xabc',
  dex,
  clearinghouseState: {
    marginSummary: {
      accountValue: value,
      totalMarginUsed: '3',
      totalNtlPos: '30',
    },
    crossMarginSummary: { accountValue: value },
    crossMaintenanceMarginUsed: '1',
    withdrawable: value,
    assetPositions: [],
  },
});

describe('PerpsAccountStateService', () => {
  let connection: BehaviorSubject<PerpsConnectionState>;
  let channels: Map<string, Subject<any>>;
  let source: jasmine.SpyObj<any>;
  let service: PerpsAccountStateService;

  const channelKey = (subscription: any) =>
    `${subscription.type}:${subscription.user}:${subscription.dex ?? ''}`;

  beforeEach(() => {
    connection = new BehaviorSubject<PerpsConnectionState>('live');
    channels = new Map();
    source = jasmine.createSpyObj(
      'PerpsAccountSource',
      ['getAccount', 'subscribe', 'watchConnectionState'],
      { enabledDexes: ['', 'xyz'] }
    );
    source.getAccount.and.returnValue(of(account()));
    source.watchConnectionState.and.returnValue(connection);
    source.subscribe.and.callFake((subscription: any) => {
      const key = channelKey(subscription);
      if (!channels.has(key)) {
        channels.set(key, new Subject());
      }
      return channels.get(key);
    });
    service = new PerpsAccountStateService(source);
  });

  it('shares one snapshot and channel set for the same address and DEX', () => {
    const first = service.watchAccount('0xABC').subscribe();
    const second = service.watchAccount('0xabc').subscribe();

    expect(source.getAccount).toHaveBeenCalledTimes(1);
    expect(source.subscribe).toHaveBeenCalledTimes(2);
    expect(source.subscribe).toHaveBeenCalledWith({
      type: 'spotState',
      user: '0xabc',
    });
    expect(source.subscribe).toHaveBeenCalledWith({
      type: 'clearinghouseState',
      user: '0xabc',
      dex: '',
    });

    first.unsubscribe();
    expect(channels.get('spotState:0xabc:').observers.length).toBe(1);
    second.unsubscribe();
    expect(channels.get('spotState:0xabc:').observers.length).toBe(0);
  });

  it('replays frames received while an older snapshot is in flight', () => {
    const snapshot = new Subject<PerpsAccount>();
    source.getAccount.and.returnValue(snapshot);
    const seen: PerpsAccountState<PerpsAccount>[] = [];
    service.watchAccount('0xabc').subscribe((state) => seen.push(state));

    channels
      .get('clearinghouseState:0xabc:')
      .next(clearinghouse('25'));
    snapshot.next(account('', { accountValueExact: '10' }));
    snapshot.complete();

    expect(seen[seen.length - 1].availability).toBe('live');
    expect(seen[seen.length - 1].account.accountValueExact).toBe('25');
  });

  it('shares concurrent authoritative refreshes', () => {
    const snapshot = new Subject<PerpsAccount>();
    source.getAccount.and.returnValue(snapshot);
    service.watchAccount('0xabc').subscribe();

    const first = service.refreshAccount('0xabc');
    const second = service.refreshAccount('0xABC');
    expect(first).toBe(second);
    expect(source.getAccount).toHaveBeenCalledTimes(1);

    snapshot.next(account());
    snapshot.complete();
  });

  it('excludes a DEX whose live refresh failed instead of mixing old data', () => {
    source.getAccount.and.returnValues(
      of(account()),
      throwError(() => new Error('down'))
    );
    const seen: PerpsAccountState<PerpsAccount>[] = [];
    service.watchAccount('0xabc').subscribe((state) => seen.push(state));
    service.refreshAccount('0xabc').subscribe();

    const latest = seen[seen.length - 1];
    expect(latest.availability).toBe('unavailable');
    expect(latest.account).toBeNull();
  });

  it('keeps last-known data while stale and repairs it after reconnect', () => {
    source.getAccount.and.returnValues(
      of(account('', { accountValueExact: '10' })),
      of(account('', { accountValueExact: '12' }))
    );
    const seen: PerpsAccountState<PerpsAccount>[] = [];
    service.watchAccount('0xabc').subscribe((state) => seen.push(state));

    connection.next('stale');
    expect(seen[seen.length - 1].availability).toBe('stale');
    expect(seen[seen.length - 1].account.accountValueExact).toBe('10');

    connection.next('live');
    expect(seen[seen.length - 1].availability).toBe('live');
    expect(seen[seen.length - 1].account.accountValueExact).toBe('12');
  });

  it('keeps known positions but makes account-level amounts unknown without canonical data', () => {
    source.getAccount.and.callFake((address: string, force: boolean, dex: string) =>
      dex === ''
        ? throwError(() => new Error('canonical down'))
        : of(
            account('xyz', {
              accountValueExact: '5',
              positions: [
                {
                  key: 'xyz:ETH',
                  dex: 'xyz',
                  coin: 'xyz:ETH',
                  symbol: 'ETH',
                } as any,
              ],
            })
          )
    );
    const seen: PerpsAccountState<PerpsAggregatedAccount>[] = [];
    service
      .watchAggregatedAccount('0xabc')
      .subscribe((state) => seen.push(state));

    const latest = seen[seen.length - 1];
    expect(latest.availability).toBe('incomplete');
    expect(latest.missingDexes).toEqual(['']);
    expect(latest.account.accountValueExact).toBeNull();
    expect(latest.account.availableBalanceExact).toBeNull();
    expect(latest.account.positions.map((item) => item.key)).toEqual([
      'xyz:ETH',
    ]);
  });

  it('aggregates standard DEXes at protocol precision and keeps the riskiest pool', () => {
    source.getAccount.and.callFake((address: string, force: boolean, dex: string) =>
      of(
        account(dex, {
          accountValueExact: dex ? '0.2' : '0.1',
          totalBalanceExact: dex ? '0.2' : '0.1',
          marginRatioExact: dex ? '12' : '5',
        })
      )
    );
    let latest: PerpsAccountState<PerpsAggregatedAccount>;
    service
      .watchAggregatedAccount('0xabc')
      .subscribe((state) => (latest = state));

    expect(latest.availability).toBe('live');
    expect(latest.account.accountValueExact).toBe('0.3');
    expect(latest.account.marginRatioExact).toBe('12');
    expect(latest.account.marginRatioDex).toBe('xyz');
  });

  it('uses canonical spot collateral once for a unified account', () => {
    source.getAccount.and.callFake((address: string, force: boolean, dex: string) =>
      of(
        account(dex, {
          unified: true,
          abstractionMode: 'unifiedAccount',
          accountValueExact: dex ? '50' : '500',
          totalBalanceExact: dex ? '50' : '500',
          availableBalanceExact: dex ? '40' : '480',
          spotUsdcExact: dex ? '0' : '500',
          spotUsdcHoldExact: dex ? '0' : '20',
          marginRatioExact: null,
        })
      )
    );
    let latest: PerpsAccountState<PerpsAggregatedAccount>;
    service
      .watchAggregatedAccount('0xabc')
      .subscribe((state) => (latest = state));

    expect(latest.account.accountValueExact).toBe('500');
    expect(latest.account.totalBalanceExact).toBe('500');
    expect(latest.account.availableBalanceExact).toBe('480');
    expect(latest.account.withdrawableExact).toBe('480');
    expect(latest.account.marginRatioExact).toBeNull();
  });

  it('routes a clearinghouse frame only to the DEX that sent it', () => {
    source.getAccount.and.callFake((address: string, force: boolean, dex: string) =>
      of(account(dex, { accountValueExact: dex ? '5' : '100' }))
    );
    let latest: PerpsAccountState<PerpsAggregatedAccount>;
    service
      .watchAggregatedAccount('0xabc')
      .subscribe((state) => (latest = state));

    channels
      .get('clearinghouseState:0xabc:xyz')
      .next(clearinghouse('7', 'xyz'));

    expect(
      latest.account.byDex.find((item) => item.dex === '').accountValueExact
    ).toBe('100');
    expect(
      latest.account.byDex.find((item) => item.dex === 'xyz').accountValueExact
    ).toBe('7');
    expect(latest.account.accountValueExact).toBe('107');
  });
});
