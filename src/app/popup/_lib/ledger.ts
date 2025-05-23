export const SLIP44 = {
  Neo2: '80000378',
  Neo3: '80000378_next',
  NeoX: '80000684',
};

export const LEDGER_PAGE_SIZE = 5;

export interface LedgerStatus {
  msg: string;
  code?: any;
  msgNeo3?: string;
  msgNeoX?: string;
  msgBoth?: string;
}

export const LedgerStatuses: { [key: string]: LedgerStatus } = {
  UNSUPPORTED: {
    msg: 'LedgerNotSupportComputer',
  },
  DISCONNECTED: {
    msg: 'connectLedgerDevice',
  },
  APP_CLOSED: {
    code: 0x6e00, // StatusCodes.CLA_NOT_SUPPORTED
    msg: 'openNeoAppOnLedger',
    msgNeo3: 'openNeo3AppOnLedger',
    msgNeoX: 'openNeoXAppOnLedger',
  },
  READY: {
    code: 0x9000, // StatusCodes.OK
    msg: 'LedgerConnectedNeoReady',
    msgNeo3: 'LedgerConnectedNeo3Ready',
    msgNeoX: 'LedgerConnectedNeoXReady',
  },
  TX_DENIED: {
    code: 0x6985, // StatusCodes.CONDITIONS_OF_USE_NOT_SATISFIED
    msg: 'TransactionDeniedByUser',
  },
  MSG_TOO_BIG: {
    code: 0x6d08,
    msg: 'TransactionTooLarge',
  },
  TX_PARSE_ERR: {
    code: 0x6d07,
    msg: 'errorLedgerOpen',
  },
};

export type HardwareDevice = 'Ledger' | 'OneKey';