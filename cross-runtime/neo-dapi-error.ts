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
