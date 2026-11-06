import BigNumber from 'bignumber.js';

import {
  PerpsAccount,
  PerpsAccountMode,
  PerpsAggregatedAccount,
  PerpsPosition,
  perpsFiniteDecimal,
} from '@popup/_lib/perps';

const isUnifiedMode = (mode: PerpsAccountMode): boolean =>
  mode === 'unifiedAccount' || mode === 'portfolioMargin';

const parseSpotUsdc = (spot: any) => {
  // 快照成功但列表里没有 USDC，是一笔权威的零。快照本身缺失，或行内字段非法，才是未知。
  if (!spot || !Array.isArray(spot.balances)) {
    return { totalExact: null, holdExact: null, spotHoldExact: undefined, freeExact: null };
  }
  const balance = spot.balances.find(
    (item) => item.coin === 'USDC' || item.token === 0
  );
  if (!balance) {
    return { totalExact: '0', holdExact: '0', spotHoldExact: undefined, freeExact: '0' };
  }
  const totalExact = perpsFiniteDecimal(balance.total);
  const holdExact = perpsFiniteDecimal(balance.hold);
  const spotHoldExact = balance.spotHold === undefined
    ? undefined
    : perpsFiniteDecimal(balance.spotHold);
  const freeExact = totalExact === null || holdExact === null
    ? null
    : BigNumber.maximum(
      0,
      new BigNumber(totalExact).minus(holdExact)
    ).toFixed();
  return { totalExact, holdExact, spotHoldExact, freeExact };
};

const emptyAccount = (): PerpsAccount => ({
  unified: false,
  abstractionMode: 'unknown',
  dex: '',
  accountValueExact: null,
  totalBalanceExact: null,
  totalMarginUsedExact: '0',
  totalNtlPosExact: '0',
  withdrawableExact: null,
  availableBalanceExact: null,
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
  const modeKnown = mode !== 'unknown';
  const {
    totalExact: spotUsdcExact,
    holdExact: spotUsdcHoldExact,
    spotHoldExact: spotUsdcSpotHoldExact,
    freeExact: freeSpotUsdcExact,
  } = parseSpotUsdc(spot);
  if (!response || !response.marginSummary) {
    return {
      ...emptyAccount(),
      unified,
      abstractionMode: mode,
      dex,
      accountValueExact: modeKnown ? (unified ? spotUsdcExact : '0') : null,
      totalBalanceExact: modeKnown ? (unified ? spotUsdcExact : '0') : null,
      availableBalanceExact: modeKnown && unified ? freeSpotUsdcExact : null,
      withdrawableExact: modeKnown ? '0' : null,
      spotUsdcExact,
      spotUsdcHoldExact,
      spotUsdcSpotHoldExact,
    };
  }

  const positions: PerpsPosition[] = (response.assetPositions || [])
    .map((item) => item.position)
    .filter((position) => {
      const sziExact = perpsFiniteDecimal(position?.szi);
      return position && sziExact !== null && !new BigNumber(sziExact).isZero();
    })
    .map((position) => {
      const sziExact = perpsFiniteDecimal(position.szi);
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
        entryPxExact: perpsFiniteDecimal(position.entryPx),
        positionValueExact: perpsFiniteDecimal(position.positionValue),
        unrealizedPnlExact: perpsFiniteDecimal(position.unrealizedPnl),
        returnOnEquityExact: perpsFiniteDecimal(position.returnOnEquity),
        liquidationPxExact: perpsFiniteDecimal(position.liquidationPx),
        leverage: Number(position.leverage?.value ?? 1),
        leverageType: position.leverage?.type ?? 'cross',
        marginUsedExact: perpsFiniteDecimal(position.marginUsed),
        fundingSinceOpenExact: perpsFiniteDecimal(position.cumFunding?.sinceOpen),
      } as PerpsPosition;
    });

  const perDexAccountValueExact = perpsFiniteDecimal(
    response.marginSummary.accountValue
  );
  const accountValueExact = unified
    ? dex
      ? '0'
      : spotUsdcExact
    : perDexAccountValueExact;
  const withdrawableExact = perpsFiniteDecimal(response.withdrawable);
  const crossAccountValueExact = perpsFiniteDecimal(
    response.crossMarginSummary?.accountValue
  );
  const crossMarginUsedExact = perpsFiniteDecimal(
    response.crossMarginSummary?.totalMarginUsed
  );
  const freeCrossMarginExact = crossAccountValueExact === null || crossMarginUsedExact === null
    ? null
    : BigNumber.maximum(
        0,
        new BigNumber(crossAccountValueExact).minus(crossMarginUsedExact)
      ).toFixed();
  const availableBalanceExact = unified
    ? dex
      ? '0'
      : freeSpotUsdcExact
    : freeCrossMarginExact;
  return {
    unified,
    abstractionMode: mode,
    dex,
    accountValueExact: modeKnown ? accountValueExact : null,
    totalBalanceExact: modeKnown ? accountValueExact : null,
    totalMarginUsedExact: perpsFiniteDecimal(
      response.marginSummary.totalMarginUsed
    ),
    totalNtlPosExact: perpsFiniteDecimal(response.marginSummary.totalNtlPos),
    withdrawableExact: modeKnown ? withdrawableExact : null,
    availableBalanceExact: modeKnown ? availableBalanceExact : null,
    spotUsdcExact,
    spotUsdcHoldExact,
    spotUsdcSpotHoldExact,
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
    spotHoldExact: spotUsdcSpotHoldExact,
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
    spotUsdcSpotHoldExact,
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
            spotHold: account.spotUsdcSpotHoldExact,
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
  const modeKnown = !!canonical && snapshots.every(
    (account) => account.abstractionMode !== 'unknown'
  );
  const sumKnown = (pick: (account: PerpsAccount) => string | null) =>
    snapshots.some((account) => pick(account) === null) ? null : sum(pick);
  const sum = (pick: (account: PerpsAccount) => string) =>
    snapshots
      .reduce(
        (total, account) => total.plus(new BigNumber(pick(account) || 0)),
        new BigNumber(0)
      )
      .toFixed();
  const freeSpotExact = canonical?.spotUsdcExact != null &&
    canonical.spotUsdcHoldExact != null
    ? BigNumber.maximum(
        0,
        new BigNumber(canonical.spotUsdcExact).minus(
          canonical.spotUsdcHoldExact
        )
      ).toFixed()
    : null;
  const withdrawalHoldExact = canonical?.spotUsdcSpotHoldExact === undefined
    ? canonical?.spotUsdcHoldExact
    : canonical.spotUsdcSpotHoldExact;
  const withdrawableSpotExact = canonical?.spotUsdcExact != null && withdrawalHoldExact != null
    ? BigNumber.maximum(0, new BigNumber(canonical.spotUsdcExact).minus(withdrawalHoldExact)).toFixed()
    : null;

  return {
    unified,
    abstractionMode: canonical?.abstractionMode ?? 'unknown',
    accountValueExact: modeKnown
      ? unified
        ? canonical.spotUsdcExact
        : sumKnown((account) => account.accountValueExact)
      : null,
    totalBalanceExact: modeKnown
      ? unified
        ? canonical.spotUsdcExact
        : sumKnown((account) => account.totalBalanceExact)
      : null,
    totalMarginUsedExact: sumKnown((account) => account.totalMarginUsedExact),
    totalNtlPosExact: sumKnown((account) => account.totalNtlPosExact),
    withdrawableExact: modeKnown
      ? unified
        ? withdrawableSpotExact
        : sumKnown((account) => account.withdrawableExact)
      : null,
    availableBalanceExact: modeKnown
      ? unified
        ? freeSpotExact
        : sumKnown((account) => account.availableBalanceExact)
      : null,
    spotUsdcExact: canonical?.spotUsdcExact ?? null,
    spotUsdcHoldExact: canonical?.spotUsdcHoldExact ?? null,
    spotUsdcSpotHoldExact: canonical?.spotUsdcSpotHoldExact,
    positions: snapshots.reduce(
      (all, account) => all.concat(account.positions || []),
      [] as PerpsPosition[]
    ),
    missingDexes,
    byDex: snapshots,
  };
}
