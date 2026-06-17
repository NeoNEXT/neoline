import { TokenStandard } from '@/app/popup/_lib';
import { ethers } from 'ethers';
import {
  getTransactionAuthorizations,
  getTypedDataAuthorizations,
} from './evm-authorization';

describe('EVM authorization recognition', () => {
  const owner = '0x1111111111111111111111111111111111111111';
  const token = '0x2222222222222222222222222222222222222222';
  const spender = '0x3333333333333333333333333333333333333333';

  it('recognizes ERC-20 approve', () => {
    const authorizations = getTransactionAuthorizations(
      { from: owner, to: token },
      { name: 'approve', args: { _spender: spender, _value: '1000000' } },
      { standard: TokenStandard.ERC20, tokenAmount: '1' },
    );

    expect(authorizations).toEqual([
      jasmine.objectContaining({
        kind: 'approve',
        owner,
        spender,
        tokenAddress: token,
        amount: '1',
      }),
    ]);
  });

  it('recognizes ERC-721 approve', () => {
    const authorizations = getTransactionAuthorizations(
      { from: owner, to: token },
      { name: 'approve', args: { _approved: spender, _tokenId: '42' } },
      { standard: TokenStandard.ERC721 },
    );

    expect(authorizations).toEqual([
      jasmine.objectContaining({
        kind: 'approve',
        owner,
        spender,
        tokenAddress: token,
        tokenId: '42',
        scope: 'token',
      }),
    ]);
  });

  it('recognizes ERC-721 setApprovalForAll', () => {
    const authorizations = getTransactionAuthorizations(
      { from: owner, to: token },
      {
        name: 'setApprovalForAll',
        args: { operator: spender, approved: true },
      },
      { standard: TokenStandard.ERC721 },
    );

    expect(authorizations).toEqual([
      jasmine.objectContaining({
        kind: 'setApprovalForAll',
        spender,
        approved: true,
        scope: 'allNfts',
      }),
    ]);
  });

  it('recognizes ERC-721 revoke approval for all', () => {
    const authorizations = getTransactionAuthorizations(
      { from: owner, to: token },
      {
        name: 'setApprovalForAll',
        args: { operator: spender, approved: false },
      },
      { standard: TokenStandard.ERC721 },
    );

    expect(authorizations).toEqual([
      jasmine.objectContaining({
        kind: 'setApprovalForAll',
        spender,
        approved: false,
        scope: 'allNfts',
      }),
    ]);
  });

  it('recognizes EIP-2612 permit transaction data', () => {
    const permitInterface = new ethers.Interface([
      'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
    ]);
    const data = permitInterface.encodeFunctionData('permit', [
      owner,
      spender,
      1000n,
      2000n,
      27,
      ethers.ZeroHash,
      ethers.ZeroHash,
    ]);

    const authorizations = getTransactionAuthorizations({
      from: owner,
      to: token,
      data,
    });

    expect(authorizations).toEqual([
      jasmine.objectContaining({
        kind: 'permit',
        owner,
        spender,
        tokenAddress: token,
        amount: '1000',
        deadline: '2000',
      }),
    ]);
  });

  it('recognizes EIP-2612 permit typed data', () => {
    const authorizations = getTypedDataAuthorizations({
      primaryType: 'Permit',
      domain: { verifyingContract: token },
      message: {
        owner,
        spender,
        value: '1000',
        deadline: '2000',
      },
    });

    expect(authorizations[0]).toEqual(
      jasmine.objectContaining({
        kind: 'permit',
        tokenAddress: token,
        amount: '1000',
      }),
    );
  });

  it('recognizes Permit2 transaction data', () => {
    const permit2Interface = new ethers.Interface([
      'function permit(address owner,((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permitSingle,bytes signature)',
    ]);
    const data = permit2Interface.encodeFunctionData('permit', [
      owner,
      {
        details: {
          token,
          amount: 1000n,
          expiration: 2000,
          nonce: 1,
        },
        spender,
        sigDeadline: 3000n,
      },
      '0x1234',
    ]);

    const authorizations = getTransactionAuthorizations({
      from: owner,
      to: '0x000000000022d473030f116ddee9f6b43ac78ba3',
      data,
    });

    expect(authorizations[0]).toEqual(
      jasmine.objectContaining({
        kind: 'permit2',
        owner,
        spender,
        tokenAddress: token,
        amount: '1000',
        deadline: '3000',
      }),
    );
  });

  it('recognizes Permit2 typed data', () => {
    const authorizations = getTypedDataAuthorizations(
      {
        primaryType: 'PermitSingle',
        domain: {
          verifyingContract:
            '0x000000000022d473030f116ddee9f6b43ac78ba3',
        },
        message: {
          spender,
          details: {
            token,
            amount: '1000',
            expiration: '2000',
          },
          sigDeadline: '3000',
        },
      },
      owner,
    );

    expect(authorizations[0]).toEqual(
      jasmine.objectContaining({
        kind: 'permit2',
        owner,
        spender,
        tokenAddress: token,
        amount: '1000',
        deadline: '3000',
      }),
    );
  });
});
