import {
  PerpsFill,
  PerpsFundingUpdate,
  PerpsLedgerUpdate,
  PerpsOpenOrder,
} from '@popup/_lib/perps';

import {
  activityDay,
  fillResult,
  fundingResult,
  fundingTitle,
  orderStatusKey,
  ledgerIsOut,
  ledgerResult,
  ledgerTitle,
  ledgerToken,
  orderHistoryTitle,
  orderIsTrigger,
  orderPriceExact,
} from './perps-history.pipe';

const WALLET = '0x5be1a4c623a63498d78c08b8890a6e5dad6bf359';
const OTHER = '0x0b80659a4076e9e93c7dbe0f10675a16a3e5c206';

const row = (delta: any): PerpsLedgerUpdate =>
  ({ time: 1, hash: '0x1', delta } as PerpsLedgerUpdate);

describe('活动页挂单显示哪个价', () => {
  /**
   * 一张市价止损单。`limitPx` 是**触发之后**那张订单的限价 —— 交易场所要求客户端自己
   * 填一个带滑点保护的激进价格，它和用户设的 `triggerPx` 差着一截，正是这条规则要区分的。
   */
  const stopMarket = (overrides: Partial<PerpsOpenOrder> = {}): PerpsOpenOrder =>
    ({
      coin: 'ETH',
      oid: '7',
      side: 'A',
      limitPx: '1710.5',
      triggerPx: '1800',
      sz: '1.5',
      origSz: '1.5',
      timestamp: 1,
      orderType: 'Stop Market',
      reduceOnly: true,
      isTrigger: true,
      ...overrides,
    } as PerpsOpenOrder);

  it('触发单显示用户设的触发价', () => {
    expect(orderPriceExact(stopMarket())).toBe('1800');
    expect(orderIsTrigger(stopMarket())).toBeTrue();
  });

  it('普通挂单显示限价', () => {
    const limit = stopMarket({
      isTrigger: false,
      triggerPx: undefined,
      orderType: 'Limit',
    });
    expect(orderPriceExact(limit)).toBe('1710.5');
    expect(orderIsTrigger(limit)).toBeFalse();
  });

  it('标着触发单却没带触发价时，标签和数字一起退回限价', () => {
    const missing = stopMarket({ triggerPx: undefined });
    // 显示 `limitPx` 却在它前面写「触发价」，比不写更糟。
    expect(orderPriceExact(missing)).toBe('1710.5');
    expect(orderIsTrigger(missing)).toBeFalse();
  });
});

describe('历史委托行标题', () => {
  const order = (overrides: Partial<PerpsOpenOrder> = {}): PerpsOpenOrder =>
    ({
      coin: 'ETH',
      oid: '1',
      side: 'A',
      limitPx: '1710.5',
      sz: '1.5',
      origSz: '1.5',
      timestamp: 1,
      orderType: 'Market',
      reduceOnly: false,
      ...overrides,
    } as PerpsOpenOrder);

  it('开仓只写 long / short，类型压成句首大写', () => {
    expect(orderHistoryTitle(order({ side: 'A', orderType: 'Market' }))).toBe(
      'Market short'
    );
    expect(orderHistoryTitle(order({ side: 'B', orderType: 'Limit' }))).toBe(
      'Limit long'
    );
    expect(
      orderHistoryTitle(order({ side: 'A', orderType: 'Take Profit Market' }))
    ).toBe('Take profit market short');
  });

  it('减仓写成 close long / close short', () => {
    expect(
      orderHistoryTitle(
        order({
          side: 'A',
          reduceOnly: true,
          orderType: 'Take Profit Market',
        })
      )
    ).toBe('Take profit market close long');
    expect(
      orderHistoryTitle(
        order({ side: 'B', reduceOnly: true, orderType: 'Stop Market' })
      )
    ).toBe('Stop market close short');
  });

  it('缺类型时只留方向，空订单不编造标题', () => {
    expect(orderHistoryTitle(order({ orderType: '' }))).toBe('short');
    expect(orderHistoryTitle(undefined)).toBe('');
  });
});

describe('历史委托状态', () => {
  it('映射已知状态及撤销、拒绝变体，未知状态交给模板显示原文', () => {
    expect(orderStatusKey('filled')).toBe('perpsStatusFilled');
    expect(orderStatusKey('open')).toBe('perpsStatusOpen');
    for (const status of ['canceled', 'scheduledCancel', 'marginCanceled', 'siblingFilledCanceled']) {
      expect(orderStatusKey(status)).toBe('perpsStatusCanceled');
    }
    for (const status of ['rejected', 'badTriggerPxRejected']) {
      expect(orderStatusKey(status)).toBe('perpsStatusRejected');
    }
    expect(orderStatusKey('triggered')).toBe('perpsStatusTriggered');
    expect(orderStatusKey('queued')).toBe('perpsStatusQueued');
    expect(orderStatusKey('brandNewStatus')).toBe('');
    expect(orderStatusKey(undefined)).toBe('');
  });
});

describe('活动页账本行的方向与金额', () => {
  it('class 划转按钱落在哪一侧判断方向', () => {
    expect(
      ledgerIsOut(row({ type: 'accountClassTransfer', toPerp: false }), WALLET)
    ).toBeTrue();
    expect(
      ledgerIsOut(row({ type: 'accountClassTransfer', toPerp: true }), WALLET)
    ).toBeFalse();
  });

  it('跨桥行的金额是 USDC，标题只跟代币不加数字', () => {
    expect(ledgerTitle(row({ type: 'deposit', usdc: '9.0' }))).toBe(
      'deposit USDC'
    );
    expect(ledgerTitle(row({ type: 'withdraw', usdc: '9.0' }))).toBe(
      'withdraw USDC'
    );
  });

  it('没有金额的行不编一个出来', () => {
    expect(ledgerTitle(row({ type: 'vaultCreate' }))).toBe(
      'vaultCreate'
    );
    expect(ledgerResult(row({ type: 'vaultCreate' }), WALLET)).toBeNull();
  });

  it('右侧金额：USDC 用带符号美元，其它代币保留原币种和流向', () => {
    expect(ledgerResult(row({ type: 'deposit', usdc: '9.0' }), WALLET)).toEqual({
      text: '+$9.00', positive: true, negative: false,
    });
    expect(ledgerResult(row({ type: 'withdraw', usdc: '9.0' }), WALLET)).toEqual({
      text: '-$9.00', positive: false, negative: true,
    });
    expect(ledgerResult(row({ type: 'deposit', usdc: '0' }), WALLET)).toEqual({
      text: '$0', positive: false, negative: false,
    });
    expect(
      ledgerResult(
        row({
          type: 'spotTransfer',
          amount: '1.5',
          token: 'HYPE',
          user: WALLET,
          destination: OTHER,
        }),
        WALLET
      )
    ).toEqual({ text: '-1.5 HYPE', positive: false, negative: true });
  });

  it('图标用的代币和金额口径一致：USDC 划转、现货代币，没有代币就不编', () => {
    expect(ledgerToken(row({ type: 'deposit', usdc: '9.0' }))).toBe('USDC');
    expect(ledgerToken(row({ type: 'internalTransfer', usdc: '0' }))).toBe('USDC');
    expect(
      ledgerToken(row({ type: 'spotTransfer', amount: '1.5', token: 'HYPE' }))
    ).toBe('HYPE');
    expect(ledgerToken(row({ type: 'vaultCreate' }))).toBe('');
  });
});

describe('成交净金额', () => {
  const fill = (overrides: Partial<PerpsFill>): PerpsFill => ({
    fee: '0', closedPnl: '0', ...overrides,
  } as PerpsFill);

  it('开仓费用显示为负数，平仓按原始精度扣费，不重复扣 builder fee', () => {
    expect(fillResult(fill({ fee: '0.449968' }))).toEqual({
      text: '-$0.45', positive: false, negative: true,
    });
    expect(fillResult(fill({ closedPnl: '0.353', fee: '0.008487', builderFee: '0.001' }))).toEqual({
      text: '+$0.34', positive: true, negative: false,
    });
    expect(fillResult(fill({ closedPnl: '-12.5', fee: '0.01' }))?.text).toBe('-$12.51');
  });

  it('小额费用和返佣保留符号，返佣增加净金额', () => {
    expect(fillResult(fill({ fee: '0.001' }))?.text).toBe('-$<0.01');
    expect(fillResult(fill({ fee: '-0.001' }))).toEqual({
      text: '+$<0.01', positive: true, negative: false,
    });
    expect(fillResult(fill({ closedPnl: '0.5', fee: '-0.001' }))?.text).toBe('+$0.50');
  });

  it('零费用和扣费后恰好打平显示中性零，不隐藏金额', () => {
    for (const entry of [fill({}), fill({ closedPnl: '0.01', fee: '0.01' })]) {
      expect(fillResult(entry)).toEqual({ text: '$0', positive: false, negative: false });
    }
  });

  it('非 USDC 费用保留原币种和方向，不与美元盈亏相减', () => {
    expect(fillResult(fill({ closedPnl: '1', fee: '0.0001', feeToken: 'HYPE' }))).toEqual({
      text: '-0.0001 HYPE', positive: false, negative: true,
    });
    expect(fillResult(fill({ fee: '-0.001', feeToken: 'HYPE' }))?.text).toBe('+0.001 HYPE');
  });

  it('缺失或非有限数值不编造金额', () => {
    expect(fillResult(undefined)).toBeNull();
    for (const entry of [
      fill({ fee: undefined }), fill({ fee: '' }), fill({ fee: 'NaN' }),
      fill({ closedPnl: 'NaN' }), fill({ closedPnl: 'Infinity' }),
    ]) {
      expect(fillResult(entry)).toBeNull();
    }
  });
});

describe('资金费行', () => {
  const funding = (usdc: string, coin = 'ETH'): PerpsFundingUpdate => ({
    time: 1,
    hash: '0x1',
    delta: { type: 'funding', coin, usdc },
  });

  it('按 usdc 正负写成收到或支付，金额保留协议精度', () => {
    expect(fundingTitle(funding('0.005588'))).toBe('Received funding fee');
    expect(fundingResult(funding('0.005588'))).toEqual({
      text: '+$0.005588', positive: true, negative: false,
    });
    expect(fundingTitle(funding('-0.005589'))).toBe('Paid funding fee');
    expect(fundingResult(funding('-0.005589'))).toEqual({
      text: '-$0.005589', positive: false, negative: true,
    });
  });

  it('零和大额分别显示中性零与千分位，不把小于一分折叠成 <$0.01', () => {
    expect(fundingTitle(funding('0'))).toBe('Paid funding fee');
    expect(fundingResult(funding('0'))).toEqual({
      text: '$0', positive: false, negative: false,
    });
    expect(fundingResult(funding('2851.187296'))?.text).toBe('+$2,851.187296');
  });

  it('缺失或非有限数值不编造标题和金额', () => {
    expect(fundingTitle({ time: 1, hash: '0x1', delta: { type: 'funding', coin: 'ETH', usdc: 'NaN' } })).toBe('');
    expect(fundingResult({ time: 1, hash: '0x1', delta: { type: 'funding', coin: 'ETH', usdc: '' } })).toBeNull();
    expect(fundingResult(undefined as any)).toBeNull();
  });
});

describe('活动日期分组', () => {
  const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
    new Date(year, month - 1, day, hour, minute).getTime();
  const now = at(2026, 9, 17);

  it('按本地日期显示今天、昨天和月日，同一天不重复标题', () => {
    expect(activityDay(at(2026, 9, 17), undefined, now)).toEqual({ key: 'perpsActivityToday' });
    expect(activityDay(at(2026, 9, 16), undefined, now)).toEqual({ key: 'perpsActivityYesterday' });
    expect(activityDay(at(2026, 9, 15), undefined, now)).toEqual({ text: 'Sep 15' });
    expect(activityDay(at(2026, 9, 17, 0), at(2026, 9, 17, 23), now)).toBeNull();
  });

  it('不到 24 小时的跨午夜记录仍归到昨天，兼容跨月和跨年', () => {
    expect(activityDay(at(2026, 9, 16, 23, 59), undefined, at(2026, 9, 17, 0, 1)))
      .toEqual({ key: 'perpsActivityYesterday' });
    expect(activityDay(at(2026, 8, 31), undefined, at(2026, 9, 1)))
      .toEqual({ key: 'perpsActivityYesterday' });
    expect(activityDay(at(2025, 12, 31), undefined, at(2026, 1, 1)))
      .toEqual({ key: 'perpsActivityYesterday' });
    expect(activityDay(at(2025, 9, 15), undefined, now)).toEqual({ text: 'Sep 15, 2025' });
  });

  it('按日历计算昨天，不假设一天总是 24 小时', () => {
    // 在有夏令时的时区中，切换日的长度可能是 23 或 25 小时。
    for (const [month, day] of [[3, 9], [11, 2]]) {
      expect(activityDay(at(2026, month, day - 1, 0), undefined, at(2026, month, day, 23)))
        .toEqual({ key: 'perpsActivityYesterday' });
    }
  });

  it('无效时间不生成错误日期标题', () => {
    expect(activityDay(NaN, undefined, now)).toBeNull();
    expect(activityDay(Infinity, undefined, now)).toBeNull();
    expect(activityDay(undefined, undefined, now)).toBeNull();
  });
});

describe('内部转账实际金额', () => {
  it('收款方扣掉费用，付款方不重复扣费', () => {
    const transfer = row({
      type: 'internalTransfer', usdc: '1000.0', fee: '1.0',
      user: OTHER, destination: WALLET,
    });
    expect(ledgerResult(transfer, WALLET)).toEqual({
      text: '+$999.00', positive: true, negative: false,
    });
    expect(ledgerResult(transfer, OTHER)).toEqual({
      text: '-$1,000.00', positive: false, negative: true,
    });
  });
});
