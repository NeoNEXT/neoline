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
