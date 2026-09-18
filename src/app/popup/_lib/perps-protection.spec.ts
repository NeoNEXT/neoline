import { protectionPrice, validProtection } from './perps-protection';

describe('perps order protection', () => {
  it('requires TP and SL to be on the correct sides of the reference price', () => {
    expect(validProtection({ takeProfitPriceExact: '120', stopLossPriceExact: '90' }, '100', true, 2)).toBeTrue();
    expect(validProtection({ takeProfitPriceExact: '90', stopLossPriceExact: '120' }, '100', false, 2)).toBeTrue();
    expect(validProtection({ takeProfitPriceExact: '120' }, '100', false, 2)).toBeFalse();
    expect(validProtection({ stopLossPriceExact: '90' }, '100', false, 2)).toBeFalse();
    expect(validProtection({ takeProfitPriceExact: '100' }, '100', true, 2)).toBeFalse();
  });

  it('accepts either protection alone but rejects missing or invalid prices', () => {
    expect(validProtection({ takeProfitPriceExact: '120' }, '100', true, 2)).toBeTrue();
    expect(validProtection({ stopLossPriceExact: '90' }, '100', true, 2)).toBeTrue();
    expect(validProtection({}, '100', true, 2)).toBeFalse();
    for (const value of ['', '0', '-1', 'NaN', 'Infinity', '1e3']) {
      expect(protectionPrice(value, 2)).toBeNull();
      expect(validProtection({ takeProfitPriceExact: value, stopLossPriceExact: '90' }, '100', true, 2)).toBeFalse();
    }
  });

  it('quantizes the trigger without floating point loss and refuses excess precision at submission', () => {
    expect(protectionPrice('123.456789', 2)).toBe('123.46');
    expect(validProtection({ takeProfitPriceExact: '123.456789' }, '100', true, 2)).toBeFalse();
  });
});
