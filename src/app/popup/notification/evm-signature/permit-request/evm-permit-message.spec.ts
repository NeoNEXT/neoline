import {
  buildPermitMessageTree,
  formatPermitAmount,
  formatPermitTimestamp,
} from './evm-permit-message';

describe('Permit message semantics', () => {
  const token = '0x3333333333333333333333333333333333333333';
  const spender = '0x2222222222222222222222222222222222222222';

  it('builds fields in the signed schema order and preserves nesting', () => {
    const tree = buildPermitMessageTree(
      {
        types: {
          PermitDetails: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' },
          ],
          PermitSingle: [
            { name: 'details', type: 'PermitDetails' },
            { name: 'spender', type: 'address' },
            { name: 'sigDeadline', type: 'uint256' },
          ],
        },
        primaryType: 'PermitSingle',
        domain: {},
        message: {
          details: { token, amount: '1000', expiration: '2000000000', nonce: '0' },
          spender,
          sigDeadline: '2000000000',
        },
      } as any,
      {
        type: 'permit2',
        variant: 'permit2-single',
        owner: '',
        spender,
        interactingAddress: token,
        entries: [
          { tokenAddress: token, rawAmount: '1000', expiration: '2000000000', nonce: '0' },
        ],
        deadline: '2000000000',
      },
      0
    );

    expect(tree.map((node) => node.label)).toEqual([
      'details',
      'spender',
      'sigDeadline',
    ]);
    expect(tree[0].children?.map((node) => node.label)).toEqual([
      'token',
      'amount',
      'expiration',
      'nonce',
    ]);
  });

  it('formats token units only when decimals are known', () => {
    expect(formatPermitAmount('1000000000000000000', 18)).toBe('1.0');
    expect(formatPermitAmount('1000000000000000000')).toBe(
      '1000000000000000000'
    );
  });

  it('formats timestamps in UTC and identifies expired zero', () => {
    expect(formatPermitTimestamp('2000000000', 'uint48', 0)).toEqual({
      value: '2033-05-18 03:33:20 UTC',
      status: 'valid',
    });
    expect(formatPermitTimestamp('0', 'uint256', 1)).toEqual({
      value: '1970-01-01 00:00:00 UTC',
      status: 'expired',
    });
  });

  it('distinguishes no-expiry sentinels from unparseable dates', () => {
    expect(formatPermitTimestamp(String((1n << 48n) - 1n), 'uint48').status).toBe(
      'no-expiry'
    );
    expect(formatPermitTimestamp(String(1n << 48n), 'uint48').status).toBe(
      'unparseable'
    );
  });
});
