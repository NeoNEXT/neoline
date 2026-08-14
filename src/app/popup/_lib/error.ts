export { createNeoDapiError } from '../../../../cross-runtime/neo-dapi-error';

/**
 * invokescript answering with FAULT means the node was reachable and the script
 * itself aborted, so the caller must not report it as a network failure. Both
 * cases are thrown as RPC_ERROR to keep the dAPI error type dApps already see
 * unchanged, and the invoke response travels along in `data`.
 */
export function isScriptFaultError(error: any): boolean {
  return error?.data?.state === 'FAULT';
}

export function getErrorMessage(error: any, fallback = 'Unknown error'): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'string') {
    return error || fallback;
  }

  return (
    error?.description ||
    error?.message ||
    error?.error?.message ||
    error?.data?.error ||
    error?.data?.exception ||
    fallback
  );
}
