import BigNumber from 'bignumber.js';

import {
  PerpsAccount,
  PerpsAccountMode,
  PerpsAggregatedAccount,
  PerpsPosition,
} from '@popup/_lib/perps';

const toFiniteDecimal = (value: any): string => {
  const parsed = new BigNumber(value ?? 0);
  return parsed.isFinite() ? (parsed.isZero() ? '0' : parsed.toFixed()) : '0';
};

const isUnifiedMode = (mode: PerpsAccountMode): boolean =>
  mode === 'unifiedAccount' || mode === 'portfolioMargin';

const parseSpotUsdc = (spot: any) => {
  const balance = (spot?.balances || []).find(
    (item) => item.coin === 'USDC' || item.token === 0
  );
  const totalExact = toFiniteDecimal(balance?.total);
  const holdExact = toFiniteDecimal(balance?.hold);
  const freeExact = BigNumber.maximum(
    0,
    new BigNumber(totalExact).minus(holdExact)
  ).toFixed();
  return { totalExact, holdExact, freeExact };
};

const calculateMarginRatioExact = (
  maintenanceMarginUsed: string,
  riskCapital: string
): string => {
  const capital = new BigNumber(riskCapital);
  return capital.isGreaterThan(0)
    ? new BigNumber(maintenanceMarginUsed)
        .dividedBy(capital)
        .times(100)
        .toFixed()
    : '0';
};

const emptyAccount = (): PerpsAccount => ({
  unified: false,
  abstractionMode: 'unknown',
  dex: '',
  accountValueExact: '0',
  totalBalanceExact: '0',
  totalMarginUsedExact: '0',
  totalNtlPosExact: '0',
  marginRatioExact: null,
  withdrawableExact: '0',
  availableBalanceExact: '0',
  spotUsdcExact: '0',
  spotUsdcHoldExact: '0',
  positions: [],
});

/** 把一份 Hyperliquid 账户快照适配成 Perps 账户模型。 */
export function parsePerpsAccount(
  response: any,
  spot?: any,
  mode: PerpsAccountMode = 'unknown',
  dex = ''
): PerpsAccount {
  const unified = isUnifiedMode(mode);
  const {
    totalExact: spotUsdcExact,
    holdExact: spotUsdcHoldExact,
    freeExact: freeSpotUsdcExact,
  } = parseSpotUsdc(spot);
  if (!response || !response.marginSummary) {
    return {
      ...emptyAccount(),
      unified,
      abstractionMode: mode,
      dex,
      accountValueExact: unified ? spotUsdcExact : '0',
      totalBalanceExact: unified ? spotUsdcExact : '0',
      availableBalanceExact: unified ? freeSpotUsdcExact : '0',
      spotUsdcExact,
      spotUsdcHoldExact,
    };
  }

  const positions: PerpsPosition[] = (response.assetPositions || [])
    .map((item) => item.position)
    .filter(
      (position) =>
        position && !new BigNumber(toFiniteDecimal(position.szi)).isZero()
    )
    .map((position) => {
      const sziExact = toFiniteDecimal(position.szi);
      const protocolCoin = String(position.coin);
      const separator = protocolCoin.indexOf(':');
      const positionDex =
        separator >= 0 ? protocolCoin.slice(0, separator) : '';
      const symbol =
        separator >= 0 ? protocolCoin.slice(separator + 1) : protocolCoin;
      return {
        key: `${positionDex || 'hl'}:${symbol}`,
        dex: positionDex,
        coin: protocolCoin,
        symbol,
        sziExact,
        isLong: new BigNumber(sziExact).isGreaterThan(0),
        entryPxExact: toFiniteDecimal(position.entryPx),
        positionValueExact: toFiniteDecimal(position.positionValue),
        unrealizedPnlExact: toFiniteDecimal(position.unrealizedPnl),
        returnOnEquityExact: toFiniteDecimal(position.returnOnEquity),
        liquidationPxExact:
          position.liquidationPx === null
            ? null
            : toFiniteDecimal(position.liquidationPx),
        leverage: Number(position.leverage?.value ?? 1),
        leverageType: position.leverage?.type ?? 'cross',
        marginUsedExact: toFiniteDecimal(position.marginUsed),
      } as PerpsPosition;
    });

  const perDexAccountValueExact = toFiniteDecimal(
    response.marginSummary.accountValue
  );
  const accountValueExact = unified
    ? dex
      ? '0'
      : spotUsdcExact
    : perDexAccountValueExact;
  const withdrawableExact = toFiniteDecimal(response.withdrawable);
  const availableBalanceExact = unified
    ? dex
      ? '0'
      : freeSpotUsdcExact
    : withdrawableExact;
  const maintenanceMarginUsedExact = toFiniteDecimal(
    response.crossMaintenanceMarginUsed
  );
  const riskCapitalExact = toFiniteDecimal(
    response.crossMarginSummary?.accountValue ?? perDexAccountValueExact
  );

  return {
    unified,
    abstractionMode: mode,
    dex,
    accountValueExact,
    totalBalanceExact: accountValueExact,
    totalMarginUsedExact: toFiniteDecimal(
      response.marginSummary.totalMarginUsed
    ),
    totalNtlPosExact: toFiniteDecimal(response.marginSummary.totalNtlPos),
    marginRatioExact: unified
      ? null
      : calculateMarginRatioExact(
          maintenanceMarginUsedExact,
          riskCapitalExact
        ),
    withdrawableExact,
    availableBalanceExact,
    spotUsdcExact,
    spotUsdcHoldExact,
    positions,
  };
}

/** 把一帧完整的现货状态折叠成规范的账户快照。 */
export function updatePerpsAccountFromSpotState(
  account: PerpsAccount,
  update: any
): PerpsAccount {
  const spot = update?.spotState || update;
  if (!account || !Array.isArray(spot?.balances)) {
    return account;
  }
  const {
    totalExact: spotUsdcExact,
    holdExact: spotUsdcHoldExact,
    freeExact: freeSpotUsdcExact,
  } = parseSpotUsdc(spot);
  return {
    ...account,
    accountValueExact: account.unified
      ? spotUsdcExact
      : account.accountValueExact,
    totalBalanceExact: account.unified
      ? spotUsdcExact
      : account.totalBalanceExact,
    availableBalanceExact: account.unified
      ? freeSpotUsdcExact
      : account.availableBalanceExact,
    spotUsdcExact,
    spotUsdcHoldExact,
  };
}

/** 把一帧完整的单 DEX 清算所状态折叠成账户快照。 */
export function updatePerpsAccountFromClearinghouseState(
  account: PerpsAccount,
  update: any
): PerpsAccount {
  const perps = update?.clearinghouseState || update;
  if (!account || !perps?.marginSummary) {
    return account;
  }
  const spot = account.dex
    ? null
    : {
        balances: [
          {
            coin: 'USDC',
            token: 0,
            total: account.spotUsdcExact,
            hold: account.spotUsdcHoldExact,
          },
        ],
      };
  return parsePerpsAccount(
    perps,
    spot,
    account.abstractionMode,
    account.dex
  );
}

/** 合并所有可读取的 DEX，同时不臆造账户级金额。 */
export function aggregatePerpsAccounts(
  snapshots: PerpsAccount[],
  missingDexes: string[] = []
): PerpsAggregatedAccount {
  const canonical = snapshots.find((account) => account.dex === '') ?? null;
  const unified = canonical?.unified ?? false;
  const sum = (pick: (account: PerpsAccount) => string) =>
    snapshots
      .reduce(
        (total, account) => total.plus(new BigNumber(pick(account) || 0)),
        new BigNumber(0)
      )
      .toFixed();
  const riskiest = unified
    ? null
    : snapshots
        .filter((account) => account.marginRatioExact !== null)
        .reduce(
          (worst, account) =>
            !worst ||
            new BigNumber(account.marginRatioExact).isGreaterThan(
              worst.marginRatioExact
            )
              ? account
              : worst,
          null as PerpsAccount
        );
  const freeSpotExact = canonical
    ? BigNumber.maximum(
        0,
        new BigNumber(canonical.spotUsdcExact).minus(
          canonical.spotUsdcHoldExact
        )
      ).toFixed()
    : null;

  return {
    unified,
    abstractionMode: canonical?.abstractionMode ?? 'unknown',
    accountValueExact: canonical
      ? unified
        ? canonical.spotUsdcExact
        : sum((account) => account.accountValueExact)
      : null,
    totalBalanceExact: canonical
      ? unified
        ? canonical.spotUsdcExact
        : sum((account) => account.totalBalanceExact)
      : null,
    totalMarginUsedExact: sum((account) => account.totalMarginUsedExact),
    totalNtlPosExact: sum((account) => account.totalNtlPosExact),
    withdrawableExact: canonical
      ? unified
        ? freeSpotExact
        : sum((account) => account.withdrawableExact)
      : null,
    availableBalanceExact: canonical
      ? unified
        ? freeSpotExact
        : sum((account) => account.availableBalanceExact)
      : null,
    spotUsdcExact: canonical?.spotUsdcExact ?? null,
    spotUsdcHoldExact: canonical?.spotUsdcHoldExact ?? null,
    marginRatioExact: riskiest?.marginRatioExact ?? null,
    marginRatioDex: riskiest?.dex ?? null,
    positions: snapshots.reduce(
      (all, account) => all.concat(account.positions || []),
      [] as PerpsPosition[]
    ),
    missingDexes,
    byDex: snapshots,
  };
}
