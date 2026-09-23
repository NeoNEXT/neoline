import { BehaviorSubject, of, Subject } from 'rxjs';

import { PerpsAccountMode, PerpsAccountState, PerpsAggregatedAccount, PerpsConnectionState } from '@popup/_lib/perps';
import { PerpsTabComponent } from '@popup/perps/perps-tab/perps-tab.component';
import { parsePerpsAccount } from './perps-account-state';
import { PerpsAccountStateService } from './perps-account-state.service';

/**
 * 每种账户模式各一个有余额地址、一个空地址。数字按地址写死，
 * 这样串号时会落到别的期望值上，而不是被同一组样例盖住。
 */
interface AddressBook {
  mode: PerpsAccountMode;
  address: string;
  funded: boolean;
  canonicalValue: string;
  canonicalWithdrawable: string;
  hip3Value: string;
  hip3Withdrawable: string;
  spotTotal: string;
  spotHold: string;
  extraCollateral?: { coin: string; total: string };
  positions: { coin: string; szi: string }[];
  equity: string | null;
  available: string | null;
  spot: string | null;
  separateSpot: boolean;
  unifiedLabel: boolean;
  empty: boolean;
  positionKeys: string[];
}

const clearinghouse = (
  accountValue: string,
  withdrawable: string,
  positions: { coin: string; szi: string }[]
) => ({
  marginSummary: {
    accountValue,
    totalMarginUsed: '0',
    totalNtlPos: '0',
  },
  withdrawable,
  assetPositions: positions.map((position) => ({ position })),
});

const BOOKS: AddressBook[] = [
  {
    mode: 'default',
    address: '0x00000000000000000000000000000000000000a1',
    funded: true,
    canonicalValue: '100',
    canonicalWithdrawable: '80',
    hip3Value: '50',
    hip3Withdrawable: '40',
    spotTotal: '20',
    spotHold: '0',
    positions: [
      { coin: 'ETH', szi: '1' },
      { coin: 'xyz:TSLA', szi: '-2' },
    ],
    equity: '150',
    available: '120',
    spot: '20',
    separateSpot: true,
    unifiedLabel: false,
    empty: false,
    positionKeys: ['hl:ETH', 'xyz:TSLA'],
  },
  {
    mode: 'default',
    address: '0x00000000000000000000000000000000000000a2',
    funded: false,
    canonicalValue: '0',
    canonicalWithdrawable: '0',
    hip3Value: '0',
    hip3Withdrawable: '0',
    spotTotal: '0',
    spotHold: '0',
    positions: [],
    equity: '0',
    available: '0',
    spot: '0',
    separateSpot: false,
    unifiedLabel: false,
    empty: true,
    positionKeys: [],
  },
  {
    mode: 'disabled',
    address: '0x00000000000000000000000000000000000000b1',
    funded: true,
    canonicalValue: '200',
    canonicalWithdrawable: '60',
    hip3Value: '30',
    hip3Withdrawable: '10',
    spotTotal: '7',
    spotHold: '1',
    positions: [{ coin: 'ETH', szi: '0.5' }],
    equity: '230',
    available: '70',
    spot: '7',
    separateSpot: true,
    unifiedLabel: false,
    empty: false,
    positionKeys: ['hl:ETH'],
  },
  {
    mode: 'disabled',
    address: '0x00000000000000000000000000000000000000b2',
    funded: false,
    canonicalValue: '0',
    canonicalWithdrawable: '0',
    hip3Value: '0',
    hip3Withdrawable: '0',
    spotTotal: '0',
    spotHold: '0',
    positions: [],
    equity: '0',
    available: '0',
    spot: '0',
    separateSpot: false,
    unifiedLabel: false,
    empty: true,
    positionKeys: [],
  },
  {
    mode: 'dexAbstraction',
    address: '0x00000000000000000000000000000000000000c1',
    funded: true,
    canonicalValue: '10',
    canonicalWithdrawable: '4',
    hip3Value: '1',
    hip3Withdrawable: '1',
    spotTotal: '3',
    spotHold: '0',
    positions: [{ coin: 'xyz:TSLA', szi: '-1' }],
    equity: '11',
    available: '5',
    spot: '3',
    separateSpot: true,
    unifiedLabel: false,
    empty: false,
    positionKeys: ['xyz:TSLA'],
  },
  {
    mode: 'dexAbstraction',
    address: '0x00000000000000000000000000000000000000c2',
    funded: false,
    canonicalValue: '0',
    canonicalWithdrawable: '0',
    hip3Value: '0',
    hip3Withdrawable: '0',
    spotTotal: '0',
    spotHold: '0',
    positions: [],
    equity: '0',
    available: '0',
    spot: '0',
    separateSpot: false,
    unifiedLabel: false,
    empty: true,
    positionKeys: [],
  },
  {
    mode: 'unifiedAccount',
    address: '0x00000000000000000000000000000000000000d1',
    funded: true,
    canonicalValue: '999',
    canonicalWithdrawable: '999',
    hip3Value: '50',
    hip3Withdrawable: '50',
    spotTotal: '120',
    spotHold: '25',
    extraCollateral: { coin: 'HYPE', total: '100' },
    positions: [
      { coin: 'ETH', szi: '1' },
      { coin: 'xyz:TSLA', szi: '-2' },
    ],
    equity: '120',
    available: '95',
    spot: '120',
    separateSpot: false,
    unifiedLabel: true,
    empty: false,
    positionKeys: ['hl:ETH', 'xyz:TSLA'],
  },
  {
    mode: 'unifiedAccount',
    address: '0x00000000000000000000000000000000000000d2',
    funded: false,
    canonicalValue: '40',
    canonicalWithdrawable: '40',
    hip3Value: '15',
    hip3Withdrawable: '15',
    spotTotal: '0',
    spotHold: '0',
    positions: [],
    equity: '0',
    available: '0',
    spot: '0',
    separateSpot: false,
    unifiedLabel: true,
    empty: true,
    positionKeys: [],
  },
  {
    mode: 'portfolioMargin',
    address: '0x00000000000000000000000000000000000000e1',
    funded: true,
    canonicalValue: '40',
    canonicalWithdrawable: '40',
    hip3Value: '15',
    hip3Withdrawable: '15',
    spotTotal: '80',
    spotHold: '80',
    extraCollateral: { coin: 'HYPE', total: '100' },
    positions: [{ coin: 'ETH', szi: '1' }],
    equity: '80',
    available: '0',
    spot: '80',
    separateSpot: false,
    unifiedLabel: true,
    empty: false,
    positionKeys: ['hl:ETH'],
  },
  {
    mode: 'portfolioMargin',
    address: '0x00000000000000000000000000000000000000e2',
    funded: false,
    canonicalValue: '7',
    canonicalWithdrawable: '7',
    hip3Value: '3',
    hip3Withdrawable: '3',
    spotTotal: '0',
    spotHold: '0',
    positions: [],
    equity: '0',
    available: '0',
    spot: '0',
    separateSpot: false,
    unifiedLabel: true,
    empty: true,
    positionKeys: [],
  },
  {
    mode: 'unknown',
    address: '0x00000000000000000000000000000000000000f0',
    funded: false,
    canonicalValue: '100',
    canonicalWithdrawable: '80',
    hip3Value: '50',
    hip3Withdrawable: '40',
    spotTotal: '20',
    spotHold: '0',
    positions: [],
    equity: null,
    available: null,
    spot: '20',
    separateSpot: false,
    unifiedLabel: false,
    empty: false,
    positionKeys: [],
  },
];

describe('Perps account modes by address', () => {
  let service: PerpsAccountStateService;
  let seen: Map<string, PerpsAccountState<PerpsAggregatedAccount>>;
  let subscriptions: { unsubscribe: () => void }[];

  beforeEach(() => {
    const channels = new Map<string, Subject<any>>();
    const source = jasmine.createSpyObj(
      'PerpsAccountSource',
      ['getAccount', 'subscribe', 'watchConnectionState'],
      { enabledDexes: ['', 'xyz'] }
    );
    source.watchConnectionState.and.returnValue(
      new BehaviorSubject<PerpsConnectionState>('live')
    );
    source.subscribe.and.callFake((subscription: { type: string; user: string; dex?: string }) => {
      const key = `${subscription.type}:${subscription.user}:${subscription.dex ?? ''}`;
      if (!channels.has(key)) {
        channels.set(key, new Subject());
      }
      return channels.get(key);
    });
    source.getAccount.and.callFake((address: string, _force: boolean, dex: string) => {
      const book = BOOKS.find((item) => item.address === address.toLowerCase());
      const onDex = (position: { coin: string }) =>
        (position.coin.includes(':') ? position.coin.slice(0, position.coin.indexOf(':')) : '') === dex;
      const positions = book.positions.filter(onDex);
      const response = clearinghouse(
        dex ? book.hip3Value : book.canonicalValue,
        dex ? book.hip3Withdrawable : book.canonicalWithdrawable,
        positions
      );
      const spot = dex
        ? null
        : {
            balances: [
              { coin: 'USDC', token: 0, total: book.spotTotal, hold: book.spotHold },
              ...(book.extraCollateral
                ? [{ coin: book.extraCollateral.coin, token: 150, total: book.extraCollateral.total, hold: '0' }]
                : []),
            ],
          };
      return of(parsePerpsAccount(response, spot, book.mode, dex));
    });
    service = new PerpsAccountStateService(source, source);
    seen = new Map();
    subscriptions = BOOKS.map((book) =>
      service.watchAggregatedAccount(book.address).subscribe((state) => {
        seen.set(book.address, state);
      })
    );
  });

  afterEach(() => {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
  });

  const cardFor = (address: string) => {
    const state = seen.get(address);
    const card = new PerpsTabComponent(null, null, null, null, null);
    card.account = state.account;
    card.accountAvailability = state.availability;
    return { state, card };
  };

  BOOKS.forEach((book) => {
    const balance = book.funded ? 'funded' : 'empty';
    it(`shows ${book.mode} ${balance} ${book.address} without borrowing another address`, () => {
      const { state, card } = cardFor(book.address);

      expect(state.availability).toBe('live');
      expect(state.account.abstractionMode).toBe(book.mode);
      expect(card.accountEquityExact).toBe(book.equity);
      expect(card.availableMarginExact).toBe(book.available);
      expect(state.account.spotUsdcExact).toBe(book.spot);
      expect(card.hasSeparateSpotUsdc).toBe(book.separateSpot);
      expect(card.accountValueLabel).toBe(
        book.unifiedLabel ? 'perpsUsdcBalance' : 'perpsAccountValue'
      );
      expect(card.emptyAccount).toBe(book.empty);
      expect(card.hasPositions).toBe(book.positionKeys.length > 0);
      expect(state.account.positions.map((position) => position.key)).toEqual(
        book.positionKeys
      );
      expect(card.globalActionsDisabled).toBeFalse();
    });
  });
});
