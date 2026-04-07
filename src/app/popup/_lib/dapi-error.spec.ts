import { ERRORS } from '@/models/dapi';
import { normalizeNeoDapiError } from '@cross-runtime/neo-dapi-error';

describe('normalizeNeoDapiError', () => {
  it('preserves known Neo dAPI errors', () => {
    const error = {
      ...ERRORS.INSUFFICIENT_FUNDS,
      description: 'custom insufficient funds',
      data: { amount: '1' },
    };

    expect(normalizeNeoDapiError(error, ERRORS.FAILED)).toEqual(error);
  });

  it('maps legacy insufficient-funds strings to structured errors', () => {
    const error = normalizeNeoDapiError(
      'no enough GAS to fee',
      ERRORS.FAILED,
    );

    expect(error.type).toBe(ERRORS.INSUFFICIENT_FUNDS.type);
    expect(error.description).toBe('no enough GAS to fee');
    expect(error.data).toBe('no enough GAS to fee');
  });

  it('uses the provided fallback for rpc-like errors', () => {
    const error = normalizeNeoDapiError(
      { message: 'rpc exploded' },
      ERRORS.RPC_ERROR,
    );

    expect(error.type).toBe(ERRORS.RPC_ERROR.type);
    expect(error.description).toBe('rpc exploded');
    expect(error.data).toEqual({ message: 'rpc exploded' });
  });

  it('uses the provided fallback for unknown errors', () => {
    const error = normalizeNeoDapiError(new Error('boom'), ERRORS.FAILED);

    expect(error.type).toBe(ERRORS.FAILED.type);
    expect(error.description).toBe('boom');
    expect(error.data).toEqual(new Error('boom'));
  });
});
