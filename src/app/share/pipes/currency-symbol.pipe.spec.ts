import { CurrencySymbolPipe } from './currency-symbol.pipe';
import { CurrencyType } from '@/app/popup/_lib/setting';

describe('CurrencySymbolPipe', () => {
  let pipe: CurrencySymbolPipe;

  beforeEach(() => {
    pipe = new CurrencySymbolPipe();
  });

  it('should create the pipe instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return ¥ for CNY', () => {
    expect(pipe.transform('CNY' as CurrencyType)).toBe('¥');
  });

  it('should return ¥ for JPY', () => {
    expect(pipe.transform('JPY' as CurrencyType)).toBe('¥');
  });

  it('should return € for EUR', () => {
    expect(pipe.transform('EUR' as CurrencyType)).toBe('€');
  });

  it('should return ₩ for KRW', () => {
    expect(pipe.transform('KRW' as CurrencyType)).toBe('₩');
  });

  it('should return $ for USD', () => {
    expect(pipe.transform('USD' as CurrencyType)).toBe('$');
  });

  it('should return $ for unknown currency (default case)', () => {
    expect(pipe.transform('ABC' as CurrencyType)).toBe('$');
  });
});
