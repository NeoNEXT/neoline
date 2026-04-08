import { ERRORS } from '@/models/dapi';
import { createNeoDapiError } from '@cross-runtime/neo-dapi-error';

describe('createNeoDapiError', () => {
  it('preserves the base error metadata for rpc errors', () => {
    const original = {
      code: -32602,
      message: 'Invalid params - Unknown transaction/blockhash',
    };
    const error = createNeoDapiError(ERRORS.RPC_ERROR, original);

    expect(error).toEqual({
      ...ERRORS.RPC_ERROR,
      data: original,
    });
  });

  it('preserves the base error metadata for malformed input errors', () => {
    const original = new Error('txid is required');
    const error = createNeoDapiError(ERRORS.MALFORMED_INPUT, original);

    expect(error).toEqual({
      ...ERRORS.MALFORMED_INPUT,
      data: original,
    });
  });

  it('stores string payloads in data unchanged', () => {
    const error = createNeoDapiError(ERRORS.UNKNOWN, 'boom');
    expect(error).toEqual({
      ...ERRORS.UNKNOWN,
      data: 'boom',
    });
  });

  it('normalizes undefined payloads to null', () => {
    const error = createNeoDapiError(ERRORS.UNKNOWN, undefined);
    expect(error).toEqual({
      ...ERRORS.UNKNOWN,
      data: null,
    });
  });
});
