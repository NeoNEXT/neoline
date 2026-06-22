import {
  getEvmPermitRequest,
  PERMIT2_ADDRESS,
} from './evm-permit-request';

describe('getEvmPermitRequest', () => {
  const owner = '0x1111111111111111111111111111111111111111';
  const spender = '0x2222222222222222222222222222222222222222';
  const token = '0x3333333333333333333333333333333333333333';
  const permitDetails = [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ];

  it('recognizes an exact EIP-2612 Permit schema', () => {
    const result = getEvmPermitRequest({
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Permit',
      domain: { chainId: 56, verifyingContract: token },
      message: { owner, spender, value: '1000', nonce: '7', deadline: '2000' },
    } as any, 56);

    expect(result).toEqual({
      type: 'permit',
      variant: 'eip2612',
      owner,
      spender,
      interactingAddress: token,
      entries: [{ tokenAddress: token, rawAmount: '1000', nonce: '7' }],
      deadline: '2000',
    });
  });

  it('recognizes a DAI-style boolean Permit', () => {
    const result = getEvmPermitRequest({
      types: {
        Permit: [
          { name: 'holder', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'allowed', type: 'bool' },
        ],
      },
      primaryType: 'Permit',
      domain: { verifyingContract: token },
      message: { holder: owner, spender, nonce: '8', expiry: '3000', allowed: true },
    } as any);

    expect(result?.variant).toBe('dai');
    expect(result?.allowed).toBeTrue();
    expect(result?.entries[0].rawAmount).toBeUndefined();
  });

  it('recognizes Permit2 PermitSingle', () => {
    const result = getEvmPermitRequest({
      types: {
        PermitDetails: permitDetails,
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
      },
      primaryType: 'PermitSingle',
      domain: { verifyingContract: PERMIT2_ADDRESS },
      message: {
        details: { token, amount: '1000', expiration: '2000', nonce: '3' },
        spender,
        sigDeadline: '3000',
      },
    } as any);

    expect(result?.variant).toBe('permit2-single');
    expect(result?.entries).toEqual([
      { tokenAddress: token, rawAmount: '1000', expiration: '2000', nonce: '3' },
    ]);
  });

  it('recognizes Permit2 PermitBatch without merging entries', () => {
    const token2 = '0x4444444444444444444444444444444444444444';
    const result = getEvmPermitRequest({
      types: {
        PermitDetails: permitDetails,
        PermitBatch: [
          { name: 'details', type: 'PermitDetails[]' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
      },
      primaryType: 'PermitBatch',
      domain: { verifyingContract: PERMIT2_ADDRESS },
      message: {
        details: [
          { token, amount: '1000', expiration: '2000', nonce: '3' },
          { token: token2, amount: '2000', expiration: '4000', nonce: '4' },
        ],
        spender,
        sigDeadline: '5000',
      },
    } as any);

    expect(result?.variant).toBe('permit2-batch');
    expect(result?.entries.map((entry) => entry.tokenAddress)).toEqual([
      token,
      token2,
    ]);
  });

  it('rejects a Permit2 primary type on an untrusted verifying contract', () => {
    expect(
      getEvmPermitRequest({
        types: {
          PermitDetails: permitDetails,
          PermitSingle: [
            { name: 'details', type: 'PermitDetails' },
            { name: 'spender', type: 'address' },
            { name: 'sigDeadline', type: 'uint256' },
          ],
        },
        primaryType: 'PermitSingle',
        domain: { verifyingContract: token },
        message: {
          details: { token, amount: '1', expiration: '2', nonce: '3' },
          spender,
          sigDeadline: '4',
        },
      } as any)
    ).toBeUndefined();
  });

  it('rejects a Permit-like message when its schema or chain does not match', () => {
    const typedData = {
      types: {
        Permit: [
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      },
      primaryType: 'Permit',
      domain: { chainId: 1, verifyingContract: token },
      message: { spender, value: '1' },
    } as any;

    expect(getEvmPermitRequest(typedData, 56)).toBeUndefined();
    expect(getEvmPermitRequest(typedData, 1)).toBeUndefined();
  });
});
