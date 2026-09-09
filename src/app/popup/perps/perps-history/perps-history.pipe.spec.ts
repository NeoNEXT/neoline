import {
  PerpsFill,
  PerpsLedgerUpdate,
  PerpsOpenOrder,
} from '@popup/_lib/perps';

import {
  fillFee,
  fillNetPnl,
  ledgerAmount,
  ledgerFee,
  ledgerIsOut,
  orderIsTrigger,
  orderPriceExact,
  orderStatusKey,
} from './perps-history.pipe';

const WALLET = '0x5be1a4c623a63498d78c08b8890a6e5dad6bf359';
const OTHER = '0x0b80659a4076e9e93c7dbe0f10675a16a3e5c206';

const row = (delta: any): PerpsLedgerUpdate =>
  ({ time: 1, hash: '0x1', delta } as PerpsLedgerUpdate);

describe('活动页的订单状态', () => {
  it('把有文案的状态翻成自己的 key', () => {
    expect(orderStatusKey('filled')).toBe('perpsStatusFilled');
    expect(orderStatusKey('open')).toBe('perpsStatusOpen');
    expect(orderStatusKey('triggered')).toBe('perpsStatusTriggered');
    expect(orderStatusKey('scheduledCancel')).toBe('perpsStatusCanceled');
  });

  it('按后缀归类那一长串撤销与拒绝变体', () => {
    expect(orderStatusKey('marginCanceled')).toBe('perpsStatusCanceled');
    expect(orderStatusKey('siblingFilledCanceled')).toBe('perpsStatusCanceled');
    expect(orderStatusKey('reduceOnlyCanceled')).toBe('perpsStatusCanceled');
    expect(orderStatusKey('badTriggerPxRejected')).toBe('perpsStatusRejected');
    expect(orderStatusKey('minTradeNtlRejected')).toBe('perpsStatusRejected');
  });

  it('没见过的状态退回原文，而不是猜一个', () => {
    expect(orderStatusKey('someBrandNewStatus')).toBe('');
    expect(orderStatusKey(undefined)).toBe('');
  });
});

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

describe('活动页账本行的方向与金额', () => {
  it('class 划转按钱落在哪一侧判断方向', () => {
    expect(
      ledgerIsOut(row({ type: 'accountClassTransfer', toPerp: false }), WALLET)
    ).toBeTrue();
    expect(
      ledgerIsOut(row({ type: 'accountClassTransfer', toPerp: true }), WALLET)
    ).toBeFalse();
  });

  it('跨桥行的金额是 USDC，并带上流向的符号', () => {
    expect(ledgerAmount(row({ type: 'deposit', usdc: '9.0' }), WALLET)).toBe(
      '+9.0 USDC'
    );
    expect(ledgerAmount(row({ type: 'withdraw', usdc: '9.0' }), WALLET)).toBe(
      '-9.0 USDC'
    );
  });

  it('现货转账以对应代币计价，方向看钱去了哪里', () => {
    expect(
      ledgerAmount(
        row({
          type: 'spotTransfer',
          amount: '1.5',
          token: 'HYPE',
          user: WALLET,
          destination: OTHER,
        }),
        WALLET
      )
    ).toBe('-1.5 HYPE');
    expect(
      ledgerAmount(
        row({
          type: 'spotTransfer',
          amount: '1.5',
          token: 'HYPE',
          user: OTHER,
          destination: WALLET,
        }),
        WALLET
      )
    ).toBe('+1.5 HYPE');
  });

  it('没有金额的行不编一个出来', () => {
    expect(ledgerAmount(row({ type: 'vaultCreate' }), WALLET)).toBe('');
  });
});

describe('活动页的手续费', () => {
  const fill = (fee: any, feeToken?: string): PerpsFill =>
    ({ fee, feeToken } as PerpsFill);

  it('真的收了才显示，并带上计价代币', () => {
    expect(fillFee(fill('0.05', 'USDC'))).toBe('0.05 USDC');
    // 没带 feeToken 的按 USDC 计价。
    expect(fillFee(fill('0.000533'))).toBe('0.00 USDC');
  });

  it('零费用显示为零，缺失费用不编造金额', () => {
    // `'0.0'` 在 JavaScript 里是真值 —— 模板里直接判 `fill.fee` 会把它印成一笔收费。
    expect(fillFee(fill('0.0'))).toBe('0.00 USDC');
    expect(fillFee(fill('0'))).toBe('0.00 USDC');
    expect(fillFee(fill(undefined))).toBe('');
    expect(fillFee(undefined)).toBe('');
  });

  it('maker 返佣留着 —— 它和「没有手续费」不是同一件事', () => {
    expect(fillFee(fill('-0.001', 'USDC'))).toBe('-0.00 USDC');
  });

  it('账本仍隐藏零费用，成交费用固定展示两位小数', () => {
    const ledger: PerpsLedgerUpdate = {
      time: 1,
      hash: '0x1',
      delta: { type: 'send', fee: '0.0', feeToken: 'USDC' },
    } as PerpsLedgerUpdate;
    expect(ledgerFee(ledger)).toBe('');
    expect(fillFee(fill('0.0', 'USDC'))).toBe('0.00 USDC');
  });
});

 describe('成交净盈亏', () => {
  it('扣除原始费用，不提前舍入或重复扣 builder fee', () => {
    expect(fillNetPnl({ closedPnl: '0.353', fee: '0.008487', builderFee: '0.001' } as PerpsFill)).toBe('0.344513');
  });
  it('maker 返佣增加净盈亏', () => {
    expect(fillNetPnl({ closedPnl: '0.5', fee: '-0.001' } as PerpsFill)).toBe('0.501');
  });
  it('开仓成交不给净盈亏 —— 那个数就是负的手续费，交给费用行去说', () => {
    expect(fillNetPnl({ closedPnl: '0', fee: '0.45' } as PerpsFill)).toBeNull();
    expect(fillNetPnl({ closedPnl: '0.0', fee: '-0.001' } as PerpsFill)).toBeNull();
  });
  it('平仓恰好打平仍然报 0，不折叠成开仓', () => {
    // 判据是 closedPnl 为零，不是相减的结果为零：这笔真平了仓位，$0.00 是它的结果。
    expect(fillNetPnl({ closedPnl: '0.01', fee: '0.01' } as PerpsFill)).toBe('0');
  });
  it('缺失或非有限数值、不同计价币种不编造美元净盈亏', () => {
    expect(fillNetPnl(undefined)).toBeNull();
    expect(fillNetPnl({ closedPnl: '0' } as PerpsFill)).toBeNull();
    expect(fillNetPnl({ closedPnl: 'NaN', fee: '0' } as PerpsFill)).toBeNull();
    expect(fillNetPnl({ closedPnl: '1', fee: '0.01', feeToken: 'HYPE' } as PerpsFill)).toBeNull();
  });
});

describe('存提款与 Hyperliquid 的展示口径', () => {
  it('跨链历史确认的 Arbitrum 提款包含通道费', () => {
    for (const fee of ['0.000505', '0.000533']) {
      const transfer = row({ type: 'send', amount: '6', fee, feeToken: 'USDC' });
      transfer.cctpDestinationChainId = 421614;
      transfer.cctpFeeExact = '0.37';
      expect(ledgerFee(transfer)).toBe('0.37 USDC');
      expect(transfer.delta.fee).toBe(fee);
    }
  });
  it('接收方扣掉内部转账费用，发送方不重复扣除', () => {
    const transfer = row({
      type: 'internalTransfer', usdc: '1000.0', fee: '1.0',
      user: OTHER, destination: WALLET,
    });
    expect(ledgerAmount(transfer, WALLET)).toBe('+999 USDC');
    expect(ledgerAmount(transfer, OTHER)).toBe('-1000.0 USDC');
  });
  it('未匹配跨链记录的发送不附加通道费', () => {
    expect(ledgerFee(row({ type: 'send', fee: '0.000505', feeToken: 'USDC' })))
      .toBe('0.000505 USDC');
  });
  it('原生手续费按 HYPE 显示，不能标成 USDC', () => {
    expect(ledgerFee(row({ type: 'send', fee: '0', nativeTokenFee: '0.001' })))
      .toBe('0.001 HYPE');
  });
});

describe('跨链历史费用不得使用固定值', () => {
  it('按每笔实际费用展示，包括零费用', () => {
    const transfer = row({ type: 'send', fee: '0.000505', feeToken: 'USDC' });
    transfer.cctpDestinationChainId = 421614;
    expect(ledgerFee(transfer)).toBe('0.000505 USDC');
    transfer.cctpFeeExact = '0';
    expect(ledgerFee(transfer)).toBe('0 USDC');
    transfer.cctpFeeExact = '1.25';
    expect(ledgerFee(transfer)).toBe('1.25 USDC');
  });
});
