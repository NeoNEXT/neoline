export type NeoDapiError = {
  type: string;
  description: string;
  data?: any;
};

export function createNeoDapiError(
  baseError: NeoDapiError,
  data: any,
): NeoDapiError {
  return {
    ...baseError,
    description: baseError.description,
    data: data ?? null,
  };
}

// The type of the Error, as defined by NEP-21.
export const enum NEP21ErrorCode {
  UNKNOWN = 10000,            // An unknown error has occurred.
  UNSUPPORTED = 10001,        // The requested feature or operation is not supported.
  INVALID = 10002,            // The input data is in an invalid format.
  NOTFOUND = 10003,           // The requested data doesn't exist.
  FAILED = 10004,             // The contract execution failed.
  TIMEOUT = 10005,            // The requested operation was cancelled due to timeout.
  CANCELED = 10006,           // The requested operation was cancelled by the user.
  INSUFFICIENT_FUNDS = 10007, // The requested operation failed due to insufficient balance.
  RPC_ERROR = 10008           // An exception was thrown by the RPC server.
}

// The reason passed to the `onRejected` callback of the promises.
export interface NEP21Error {
  code: NEP21ErrorCode;    // The code of the error.
  message: string;    // The message of the error.
  data?: any;         // Additional data for the error.
}
