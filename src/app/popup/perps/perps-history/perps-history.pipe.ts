import { Pipe, PipeTransform } from '@angular/core';
import BigNumber from 'bignumber.js';

import {
  PerpsFill,
  PerpsFundingUpdate,
  PerpsLedgerUpdate,
  PerpsOpenOrder,
} from '@popup/_lib/perps';
import { formatSignedUsd, formatUsd } from '../perps.util';

/**
 * 活动页的价格、金额和费用展示规则，以及包住它们的纯管道。
 *
 * 规则是普通函数，组件和测试直接调用；管道只是包一层。理由和
 * [perps-format.pipe.ts](../perps-format.pipe.ts) 一样：模板里直接调组件方法，会在每一轮
 * 变更检测中把每一行重算一遍 —— 而这一页最多能列 200 行，每行要问七八个问题。
 * 纯管道按参数缓存，没有变动的行只算一次。
 */

//#region 订单

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

/**
 * 当前和历史委托共用的行标题：订单类型 + 方向。
 *
 * `orderType` 先压成句首大写（`Take Profit Market` → `Take profit market`），再拼方向：
 * 开仓只写 `long` / `short`，减仓写 `close long` / `close short`。缺类型时只留方向，
 * 免得屏幕上冒出一个光秃秃的 `undefined short`。
 */
export function orderHistoryTitle(order: PerpsOpenOrder): string {
  if (!order) {
    return '';
  }
  const isBuy = order.side === 'B';
  const direction = order.reduceOnly
    ? isBuy
      ? 'close short'
      : 'close long'
    : isBuy
      ? 'long'
      : 'short';
  const type = sentenceCase(order.orderType || '');
  return type ? `${type} ${direction}` : direction;
}

/** MetaMask 活动页状态文案；未知协议状态保留原文。 */
export function orderStatusKey(status: string): string {
  switch (status) {
    case 'filled': return 'perpsStatusFilled';
    case 'open': return 'perpsStatusOpen';
    case 'canceled':
    case 'scheduledCancel': return 'perpsStatusCanceled';
    case 'rejected': return 'perpsStatusRejected';
    case 'triggered': return 'perpsStatusTriggered';
    case 'queued': return 'perpsStatusQueued';
  }
  if (status?.endsWith('Canceled')) {
    return 'perpsStatusCanceled';
  }
  return status?.endsWith('Rejected') ? 'perpsStatusRejected' : '';
}

/** 句首大写，其余小写 —— 用来压平交易场所大小写不一的 `orderType`。 */
function sentenceCase(value: string): string {
  const lower = value.trim().toLowerCase();
  return lower ? `${lower.charAt(0).toUpperCase()}${lower.slice(1)}` : '';
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

/** 账本行在给用户看时用的代币：USDC 划转是 USDC，现货行用 `token`，其余没有。 */
export function ledgerToken(update: PerpsLedgerUpdate): string {
  const delta = update?.delta || ({} as any);
  if (delta.usdc !== undefined) {
    return 'USDC';
  }
  return delta.token || '';
}

/**
 * 账本行的协议金额：内部转账收款方扣掉费用，其余原样。
 * 符号不在这里，右侧金额用 `ledgerResult`。
 */
function ledgerValue(
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
  return String(value);
}

/**
 * 账本行标题：类型原文后面跟上代币，例如 `deposit USDC`。
 * 金额只出现在右侧，标题里不再重复。没有代币的行只留类型。
 */
export function ledgerTitle(update: PerpsLedgerUpdate): string {
  const type = update?.delta?.type || '';
  const token = ledgerToken(update);
  return [type, token].filter(Boolean).join(' ');
}

/** 账本行右侧金额：USDC 用带符号美元，其它代币保留原币种。 */
export function ledgerResult(
  update: PerpsLedgerUpdate,
  address: string
): PerpsActivityResult | null {
  const value = ledgerValue(update, address);
  if (!value) {
    return null;
  }
  const amount = new BigNumber(value);
  return activityResult(
    ledgerIsOut(update, address) ? amount.negated() : amount,
    ledgerToken(update)
  );
}

export interface PerpsActivityResult {
  text: string;
  positive: boolean;
  negative: boolean;
}

/** 统一金额符号和颜色；资金费通过 decimals 保留协议精度。 */
function activityResult(
  amount: BigNumber,
  token: string,
  decimals = 2
): PerpsActivityResult | null {
  if (!amount.isFinite()) {
    return null;
  }
  const positive = amount.isGreaterThan(0);
  const negative = amount.isLessThan(0);
  const sign = positive ? '+' : negative ? '-' : '';
  return {
    text: token === 'USDC'
      ? amount.isZero() ? formatUsd('0') : formatSignedUsd(amount, decimals)
      : `${sign}${amount.absoluteValue().toFixed()}${token ? ` ${token}` : ''}`,
    positive,
    negative,
  };
}

/** 成交的净金额；费用为支出，返佣为收入，fee 已包含 builder fee。 */
export function fillResult(fill: PerpsFill): PerpsActivityResult | null {
  if (fill?.fee == null || fill.fee === '') {
    return null;
  }
  const fee = new BigNumber(fill.fee);
  const token = fill.feeToken || 'USDC';
  // 非 USDC 费用保留原币种，不与美元盈亏相减。
  const amount = token === 'USDC'
    ? new BigNumber(fill.closedPnl ?? '0').minus(fee)
    : fee.negated();
  return activityResult(amount, token);
}

/**
 * 资金费行标题，跟 Hyperliquid 活动页同一句英文。
 * `usdc` 为正是收到，其余（支付、零）都读作支付。
 */
export function fundingTitle(update: PerpsFundingUpdate): string {
  const usdc = new BigNumber(update?.delta?.usdc);
  if (!usdc.isFinite()) {
    return '';
  }
  return usdc.isGreaterThan(0)
    ? 'Received funding fee'
    : 'Paid funding fee';
}

/** 资金费金额保留协议精度；小于一分也不折叠成 `<$0.01`。 */
export function fundingResult(
  update: PerpsFundingUpdate
): PerpsActivityResult | null {
  const usdc = update?.delta?.usdc;
  if (usdc == null || usdc === '') {
    return null;
  }
  const amount = new BigNumber(usdc);
  return activityResult(amount, 'USDC', amount.decimalPlaces() ?? 0);
}

//#endregion

@Pipe({ name: 'perpsOrderStatus' })
export class PerpsOrderStatusPipe implements PipeTransform {
  transform(status: string): string {
    return orderStatusKey(status);
  }
}

@Pipe({ name: 'perpsOrderHistoryTitle' })
export class PerpsOrderHistoryTitlePipe implements PipeTransform {
  transform(order: PerpsOpenOrder): string {
    return orderHistoryTitle(order);
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

@Pipe({ name: 'perpsLedgerToken' })
export class PerpsLedgerTokenPipe implements PipeTransform {
  transform(update: PerpsLedgerUpdate): string {
    return ledgerToken(update);
  }
}

@Pipe({ name: 'perpsLedgerTitle' })
export class PerpsLedgerTitlePipe implements PipeTransform {
  transform(update: PerpsLedgerUpdate): string {
    return ledgerTitle(update);
  }
}

@Pipe({ name: 'perpsLedgerResult' })
export class PerpsLedgerResultPipe implements PipeTransform {
  transform(update: PerpsLedgerUpdate, address: string): PerpsActivityResult | null {
    return ledgerResult(update, address);
  }
}

@Pipe({ name: 'perpsFillResult' })
export class PerpsFillResultPipe implements PipeTransform {
  transform(fill: PerpsFill): PerpsActivityResult | null {
    return fillResult(fill);
  }
}

@Pipe({ name: 'perpsFundingTitle' })
export class PerpsFundingTitlePipe implements PipeTransform {
  transform(update: PerpsFundingUpdate): string {
    return fundingTitle(update);
  }
}

@Pipe({ name: 'perpsFundingResult' })
export class PerpsFundingResultPipe implements PipeTransform {
  transform(update: PerpsFundingUpdate): PerpsActivityResult | null {
    return fundingResult(update);
  }
}

export interface PerpsActivityDay {
  key?: 'perpsActivityToday' | 'perpsActivityYesterday';
  text?: string;
}

/** 按本地日历日分组；相邻两行属于同一天时不重复标题。 */
export function activityDay(
  time: number,
  previous: number | undefined,
  now: number
): PerpsActivityDay | null {
  if (!Number.isFinite(time)) {
    return null;
  }
  const date = new Date(time);
  const day = new Date(time).setHours(0, 0, 0, 0);
  if (!Number.isFinite(day) ||
      (Number.isFinite(previous) && day === new Date(previous).setHours(0, 0, 0, 0))) {
    return null;
  }
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (day === today.getTime()) {
    return { key: 'perpsActivityToday' };
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === yesterday.getTime()) {
    return { key: 'perpsActivityYesterday' };
  }
  return {
    text: date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
    }),
  };
}

@Pipe({ name: 'perpsActivityDay' })
export class PerpsActivityDayPipe implements PipeTransform {
  transform(time: number, previous: number | undefined, now: number): PerpsActivityDay | null {
    return activityDay(time, previous, now);
  }
}

export const PERPS_HISTORY_PIPES = [
  PerpsActivityDayPipe,
  PerpsFillResultPipe,
  PerpsFundingResultPipe,
  PerpsFundingTitlePipe,
  PerpsOrderHistoryTitlePipe,
  PerpsOrderStatusPipe,
  PerpsOrderIsTriggerPipe,
  PerpsOrderPricePipe,
  PerpsLedgerIsOutPipe,
  PerpsLedgerTokenPipe,
  PerpsLedgerTitlePipe,
  PerpsLedgerResultPipe,
];
