import { ERRORS } from './neo2-shared';

export type NeoDapiError = {
  type: string;
  description: string;
  data?: any;
};

const KNOWN_ERRORS = Object.values(ERRORS);

function getErrorDescription(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  return (
    error?.description ||
    error?.message ||
    error?.error?.message ||
    error?.data?.error ||
    error?.data?.exception ||
    error?.error?.exception ||
    error?.error ||
    String(error)
  );
}

export function createNeoDapiError(
  baseError: NeoDapiError,
  description?: string,
  data?: any,
): NeoDapiError {
  return {
    ...baseError,
    description: description || baseError.description,
    data: data ?? null,
  };
}

export function normalizeNeoDapiError(
  error: any,
  fallback: NeoDapiError = ERRORS.UNKNOWN,
): NeoDapiError {
  if (KNOWN_ERRORS.some((item) => item.type === error?.type)) {
    return createNeoDapiError(
      error,
      error?.description || fallback.description,
      error?.data ?? error?.error ?? null,
    );
  }

  const description = getErrorDescription(error);

  if (
    description === 'no balance' ||
    description === 'no enough balance to pay' ||
    description === 'no enough GAS to fee'
  ) {
    return createNeoDapiError(ERRORS.INSUFFICIENT_FUNDS, description, error);
  }

  return createNeoDapiError(
    fallback,
    description || fallback.description,
    error,
  );
}
