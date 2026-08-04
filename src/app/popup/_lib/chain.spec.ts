import {
  ChainTypeGroups,
  CreatableChainTypeGroups,
  supportsWalletCreation,
} from './chain';

describe('wallet creation chain support', () => {
  it('does not support creating Neo Legacy wallets', () => {
    expect(supportsWalletCreation('Neo2')).toBeFalse();
  });

  it('supports creating Neo N3 and Neo X wallets', () => {
    expect(supportsWalletCreation('Neo3')).toBeTrue();
    expect(supportsWalletCreation('NeoX')).toBeTrue();
  });

  it('provides a creation chain list without Neo Legacy', () => {
    expect(CreatableChainTypeGroups).toEqual(ChainTypeGroups.slice(0, 2));
  });
});
