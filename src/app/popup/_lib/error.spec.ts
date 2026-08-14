import { createNeoDapiError, isScriptFaultError } from './error';
import { ERRORS } from '@/models/dapi';

describe('isScriptFaultError', () => {
  it('recognises a FAULT returned by invokescript', () => {
    const error = createNeoDapiError(ERRORS.RPC_ERROR, {
      state: 'FAULT',
      gasconsumed: '0',
      exception: 'ASSERT is executed with false result.',
    });

    expect(isScriptFaultError(error)).toBeTrue();
  });

  it('does not treat an unreachable node as a FAULT', () => {
    const error = createNeoDapiError(
      ERRORS.RPC_ERROR,
      new Error('Failed to fetch')
    );

    expect(isScriptFaultError(error)).toBeFalse();
  });

  it('does not throw on an error without data', () => {
    expect(isScriptFaultError(undefined)).toBeFalse();
    expect(isScriptFaultError({ type: 'UNKNOWN' })).toBeFalse();
  });
});
