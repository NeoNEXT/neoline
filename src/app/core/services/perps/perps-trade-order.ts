/** Internal order shared only by the trade module and exchange adapter. */
export interface PerpsOrder {
  assetId: number;
  isBuy: boolean;
  priceExact: string;
  sizeExact: string;
  reduceOnly: boolean;
  timeInForce: 'Ioc' | 'Gtc';
  /** Stable 16-byte id that identifies an ambiguous submission. */
  cloid: string;
}

export type PerpsTradeOrderErrorCode =
  | 'invalid-intent'
  | 'position-changed'
  | 'account-unavailable'
  /** The leverage write was refused, so no order was ever sent. */
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
