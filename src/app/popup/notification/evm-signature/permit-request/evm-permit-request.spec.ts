import { getEvmPermitRequest } from './evm-permit-request';

describe('getEvmPermitRequest', () => {
  const token = '0x1111111111111111111111111111111111111111';
  const spender = '0x2222222222222222222222222222222222222222';

  it('parses Permit typed data', () => {
    expect(
      getEvmPermitRequest({
        primaryType: 'Permit',
        domain: { verifyingContract: token },
        message: { spender, value: '0' },
      } as any)
    ).toEqual({
      type: 'permit',
      rawAmount: '0',
      spender,
      tokenAddress: token,
      interactingAddress: token,
    });
  });

  it('parses Permit2 typed data', () => {
    const permit2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';

    expect(
      getEvmPermitRequest({
        primaryType: 'PermitSingle',
        domain: { verifyingContract: permit2 },
        message: {
          spender,
          details: { token, amount: '1000' },
        },
      } as any)
    ).toEqual({
      type: 'permit2',
      rawAmount: '1000',
      spender,
      tokenAddress: token,
      interactingAddress: permit2,
    });
  });

  it('ignores unrelated typed data', () => {
    expect(
      getEvmPermitRequest({
        primaryType: 'Mail',
        domain: {},
        message: { contents: 'hello' },
      } as any)
    ).toBeUndefined();
  });
});
