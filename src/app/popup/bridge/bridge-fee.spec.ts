import {
  getMaxBridgeAmount,
  hasEnoughGasForBridgeFees,
  isValidBridgeBalance,
} from './bridge-fee';

describe('isValidBridgeBalance', () => {
  it('rejects a balance that has not finished loading', () => {
    expect(isValidBridgeBalance(undefined)).toBeFalse();
  });

  it('accepts a loaded token balance', () => {
    expect(isValidBridgeBalance('4.77436123')).toBeTrue();
  });
});

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

describe('getMaxBridgeAmount', () => {
  it('updates the MAX amount with the latest network fee', () => {
    expect(getMaxBridgeAmount('13.69413828', '0.00250588', 8)).toBe(
      '13.6916324'
    );
  });
});
