import { hasEnoughGasForBridgeFees } from './bridge-fee';

describe('hasEnoughGasForBridgeFees', () => {
  it('returns false when GAS is less than the bridge and network fees', () => {
    expect(hasEnoughGasForBridgeFees('0.02', '0.01', '0.011')).toBeFalse();
  });

  it('returns true when GAS exactly covers all fees', () => {
    expect(hasEnoughGasForBridgeFees('0.02', '0.01', '0.01')).toBeTrue();
  });

  it('returns false when the GAS balance has not been loaded', () => {
    expect(hasEnoughGasForBridgeFees(undefined, '0.01', '0.01')).toBeFalse();
  });
});
