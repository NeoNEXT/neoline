/** 只在交易模块与交易场所适配器之间共享的内部订单。 */
export interface PerpsOrder {
  assetId: number;
  isBuy: boolean;
  priceExact: string;
  sizeExact: string;
  reduceOnly: boolean;
  timeInForce: 'Ioc' | 'Gtc';
  /** 用于标识一次结果不明的提交的 16 字节稳定 id。 */
  cloid: string;
}

export type PerpsTradeOrderErrorCode =
  | 'invalid-intent'
  | 'position-changed'
  | 'account-unavailable'
  /** 杠杆写入被拒绝，因此订单从未发出。 */
  | 'leverage-write';

export class PerpsTradeOrderError extends Error {
  constructor(
    readonly code: PerpsTradeOrderErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PerpsTradeOrderError';
  }
}
