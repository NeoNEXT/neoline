import { Pipe, PipeTransform } from '@angular/core';
import BigNumber from 'bignumber.js';

import {
  PerpsFill,
  PerpsLedgerUpdate,
  PerpsOpenOrder,
} from '@popup/_lib/perps';
import { isNonZeroExact, PerpsExactValue } from '../perps.util';

/**
 * 活动页把协议事实读成人话的那些规则，以及包住它们的纯管道。
 *
 * 规则是普通函数，组件和测试直接调用；管道只是包一层。理由和
 * [perps-format.pipe.ts](../perps-format.pipe.ts) 一样：模板里直接调组件方法，会在每一轮
 * 变更检测中把每一行重算一遍 —— 而这一页最多能列 200 行，每行要问七八个问题。
 * 纯管道按参数缓存，没有变动的行只算一次。
 */

/**
 * 有友好文案的订单状态。Hyperliquid 还有一长串 `xxxCanceled` / `xxxRejected` 变体，
 * 在 orderStatusKey 里按后缀统一处理。
 */
const ORDER_STATUS_LABELS = {
  filled: 'perpsStatusFilled',
  open: 'perpsStatusOpen',
  canceled: 'perpsStatusCanceled',
  scheduledCancel: 'perpsStatusCanceled',
  rejected: 'perpsStatusRejected',
  triggered: 'perpsStatusTriggered',
};

/**
 * Hyperliquid 自己的活动表格命名的是「动作」而不是账本原语，这份列表跟着它来：Arbitrum
 * 跨桥读作入金或出金，它的点对点 USDC 操作按本钱包处在哪一端读作转出或转入，而在现货与
 * 永续余额之间挪动抵押品读作划转。
 */
const LEDGER_TYPE_LABELS = {
  deposit: 'perpsLedgerDeposit',
  withdraw: 'perpsLedgerWithdraw',
  internalTransfer: 'perpsLedgerSend',
  accountClassTransfer: 'perpsLedgerTransfer',
  subAccountTransfer: 'perpsLedgerTransfer',
};

/**
 * 成交方向的文案。
 *
 * `userFills` 的 `dir` 不是枚举，是交易场所直接给的英文短语，而这份短语表**没有进过官方
 * 文档**。所以这里只认四个能对上的常规方向，其余（仓位反手 `Long > Short`、强平、ADL……）
 * 退回协议原文 —— 与 `orderStatusKey` / `ledgerTypeKey` 同一条路子：宁可显示一句英文，
 * 也不猜一个中文出来。
 */
const FILL_DIRECTION_LABELS = {
  'Open Long': 'perpsOpenLong',
  'Open Short': 'perpsOpenShort',
  'Close Long': 'perpsCloseLong',
  'Close Short': 'perpsCloseShort',
};

/**
 * 现货转账没有固定文案。HyperEVM 或跨桥转账正是以它的形式落地的，所以 Hyperliquid 按钱
 * 的流向来命名：转入读作入金，转出读作出金。
 */
const DIRECTIONAL_LEDGER_TYPES = ['send', 'spotTransfer'];

//#region 订单

/** 把 Hyperliquid 的方向和 reduce-only 标记翻译成交易意图。 */
export function orderDirectionKey(
  order: PerpsOpenOrder
): 'perpsOpenLong' | 'perpsOpenShort' | 'perpsCloseLong' | 'perpsCloseShort' {
  const isBuy = order.side === 'B';
  if (order.reduceOnly) {
    return isBuy ? 'perpsCloseShort' : 'perpsCloseLong';
  }
  return isBuy ? 'perpsOpenLong' : 'perpsOpenShort';
}

/** 成交方向的 i18n key；短语表里没有的方向返回 ''，由模板显示协议原文。 */
export function fillDirectionKey(fill: PerpsFill): string {
  return FILL_DIRECTION_LABELS[fill?.dir] || '';
}

/** 订单状态的 i18n key；需要显示原始值时返回 ''。 */
export function orderStatusKey(status: string): string {
  if (ORDER_STATUS_LABELS[status]) {
    return ORDER_STATUS_LABELS[status];
  }
  if (status?.endsWith('Canceled')) {
    return 'perpsStatusCanceled';
  }
  if (status?.endsWith('Rejected')) {
    return 'perpsStatusRejected';
  }
  return '';
}

/**
 * 这张挂单的价格是不是一个触发价。
 *
 * 判定要求 `triggerPx` 真的在：标着「触发价」却显示着限价，比不标更糟。缺了它就退回
 * 当成普通挂单，那样至少屏幕上的数字和标签说的是同一件事。
 */
export function orderIsTrigger(order: PerpsOpenOrder): boolean {
  return !!order.isTrigger && !!order.triggerPx;
}

/**
 * 一张挂单该把哪个价显示出来。
 *
 * 触发单（止盈/止损）的 `limitPx` 是**触发之后**那张订单的限价。按官方契约，市价触发单
 * 的这个字段是交易场所要求客户端自己填的、带滑点保护的激进价格 —— 它和用户在别处设定的
 * 东西没有任何关系，把它显示成「这张单的价格」是在报一个假数字。用户设的是 `triggerPx`。
 *
 * 来源：Exchange endpoint 的 `{"trigger":{"isMarket","triggerPx","tpsl"}}`，以及
 * Take Profit and Stop Loss（`p` 仍是触发后订单的 limit price）。
 */
export function orderPriceExact(order: PerpsOpenOrder): string {
  return orderIsTrigger(order) ? order.triggerPx : order.limitPx;
}

//#endregion

//#region 账本

export function ledgerIsOut(
  update: PerpsLedgerUpdate,
  address: string
): boolean {
  const delta = update?.delta || ({} as any);
  if (delta.type === 'withdraw') {
    return true;
  }
  // class transfer 落到现货那一侧时，意味着抵押品被移出了永续账户。
  if (delta.type === 'accountClassTransfer') {
    return delta.toPerp === false;
  }
  // 点对点的行同时带着双方：除非钱落到了本地址上，否则我们就是发送方。
  if (delta.destination) {
    return delta.destination.toLowerCase() !== address?.toLowerCase();
  }
  return false;
}

/** 账本行的 i18n key；遇到冷门类型（vault、staking 等）时返回 ''。 */
export function ledgerTypeKey(
  update: PerpsLedgerUpdate,
  address: string
): string {
  const type = update?.delta?.type;
  if (DIRECTIONAL_LEDGER_TYPES.indexOf(type) > -1) {
    return ledgerIsOut(update, address)
      ? 'perpsLedgerWithdraw'
      : 'perpsLedgerDeposit';
  }
  return LEDGER_TYPE_LABELS[type] || '';
}

/** 账本金额在跨桥/class 行里是 USDC，其余情况以对应代币计价。 */
export function ledgerAmount(
  update: PerpsLedgerUpdate,
  address: string
): string {
  const delta = update?.delta || ({} as any);
  let value = delta.usdc ?? delta.amount;
  if (value === undefined) {
    return '';
  }
  if (delta.type === 'internalTransfer' && !ledgerIsOut(update, address)) {
    const received = new BigNumber(value).minus(delta.fee ?? '0');
    if (!received.isFinite()) {
      return '';
    }
    value = received.toFixed();
  }
  const token = delta.usdc !== undefined ? 'USDC' : delta.token || '';
  return `${ledgerIsOut(update, address) ? '-' : '+'}${value} ${token}`.trim();
}

//#endregion

//#region 手续费

/** 账本手续费保留协议精度；零费用不占一行。 */
function feeLabel(fee: PerpsExactValue, feeToken?: string): string {
  return isNonZeroExact(fee) ? `${fee} ${feeToken || 'USDC'}`.trim() : '';
}

/** 一条账本行额外收取的手续费。 */
export function ledgerFee(update: PerpsLedgerUpdate): string {
  const delta = update?.delta || ({} as any);
  if (isNonZeroExact(delta.nativeTokenFee)) {
    return feeLabel(delta.nativeTokenFee, 'HYPE');
  }
  if (update.cctpFeeExact != null &&
      (!delta.feeToken || delta.feeToken === 'USDC')) {
    const fee = new BigNumber(delta.fee ?? '0').plus(update.cctpFeeExact);
    return fee.isFinite()
      ? `${fee.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed()} USDC`
      : '';
  }
  return feeLabel(delta.fee, delta.feeToken);
}

/**
 * 一笔成交收取的手续费。
 *
 * 它**已经含了 builder fee**（另有一个可选的 `builderFee` 字段单独报告同一笔钱），
 * 所以这里绝不能再加一次。来源：Subscriptions 与 Builder codes。
 */
export function fillFee(fill: PerpsFill): string {
  if (fill?.fee == null) {
    return '';
  }
  const fee = new BigNumber(fill.fee);
  if (!fee.isFinite()) {
    return '';
  }
  // USDC 成交费用与 Hyperliquid 一样保留两位小数。
  const token = fill.feeToken || 'USDC';
  const value = token === 'USDC'
    ? fee.toFixed(2, BigNumber.ROUND_HALF_UP)
    : fee.toFixed();
  return `${value} ${token}`;
}

/**
 * 先以协议精度扣除本笔费用，再由展示管道舍入；fee 已包含 builderFee。
 *
 * 开仓成交没有已实现盈亏，`closedPnl` 为零，于是 `closedPnl - fee` 恰好等于负的手续费 ——
 * 和同一行里的费用是同一个数字，只差一个负号。把它显示成 PnL，等于把手续费说成这笔交易的
 * 亏损。所以开仓不给 PnL，那一行让给费用。
 *
 * 判据是 `closedPnl` 本身为零，而不是相减的结果为零：一笔真平掉了仓位、扣完费用恰好打平的
 * 成交，`PnL: $0.00` 是它准确的结果，不该被折叠成费用。
 */
export function fillNetPnl(fill: PerpsFill): string | null {
  if (fill?.closedPnl == null || fill?.fee == null) {
    return null;
  }
  // 不把非 USDC 手续费直接当成美元扣除。
  if (fill.feeToken && fill.feeToken !== 'USDC') {
    return null;
  }
  const closed = new BigNumber(fill.closedPnl);
  if (!closed.isFinite() || closed.isZero()) {
    return null;
  }
  const pnl = closed.minus(fill.fee);
  return pnl.isFinite() ? pnl.toFixed() : null;
}

//#endregion

@Pipe({ name: 'perpsOrderDirection' })
export class PerpsOrderDirectionPipe implements PipeTransform {
  transform(order: PerpsOpenOrder): string {
    return orderDirectionKey(order);
  }
}

@Pipe({ name: 'perpsFillDirection' })
export class PerpsFillDirectionPipe implements PipeTransform {
  transform(fill: PerpsFill): string {
    return fillDirectionKey(fill);
  }
}

@Pipe({ name: 'perpsOrderStatus' })
export class PerpsOrderStatusPipe implements PipeTransform {
  transform(status: string): string {
    return orderStatusKey(status);
  }
}

@Pipe({ name: 'perpsOrderIsTrigger' })
export class PerpsOrderIsTriggerPipe implements PipeTransform {
  transform(order: PerpsOpenOrder): boolean {
    return orderIsTrigger(order);
  }
}

@Pipe({ name: 'perpsOrderPrice' })
export class PerpsOrderPricePipe implements PipeTransform {
  transform(order: PerpsOpenOrder): string {
    return orderPriceExact(order);
  }
}

@Pipe({ name: 'perpsLedgerIsOut' })
export class PerpsLedgerIsOutPipe implements PipeTransform {
  transform(update: PerpsLedgerUpdate, address: string): boolean {
    return ledgerIsOut(update, address);
  }
}

@Pipe({ name: 'perpsLedgerType' })
export class PerpsLedgerTypePipe implements PipeTransform {
  transform(update: PerpsLedgerUpdate, address: string): string {
    return ledgerTypeKey(update, address);
  }
}

@Pipe({ name: 'perpsLedgerAmount' })
export class PerpsLedgerAmountPipe implements PipeTransform {
  transform(update: PerpsLedgerUpdate, address: string): string {
    return ledgerAmount(update, address);
  }
}

@Pipe({ name: 'perpsLedgerFee' })
export class PerpsLedgerFeePipe implements PipeTransform {
  transform(update: PerpsLedgerUpdate): string {
    return ledgerFee(update);
  }
}

@Pipe({ name: 'perpsFillFee' })
export class PerpsFillFeePipe implements PipeTransform {
  transform(fill: PerpsFill): string {
    return fillFee(fill);
  }
}

@Pipe({ name: 'perpsFillNetPnl' })
export class PerpsFillNetPnlPipe implements PipeTransform {
  transform(fill: PerpsFill): string | null {
    return fillNetPnl(fill);
  }
}

export const PERPS_HISTORY_PIPES = [
  PerpsFillNetPnlPipe,
  PerpsOrderDirectionPipe,
  PerpsFillDirectionPipe,
  PerpsOrderStatusPipe,
  PerpsOrderIsTriggerPipe,
  PerpsOrderPricePipe,
  PerpsLedgerIsOutPipe,
  PerpsLedgerTypePipe,
  PerpsLedgerAmountPipe,
  PerpsLedgerFeePipe,
  PerpsFillFeePipe,
];
