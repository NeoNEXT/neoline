import { NumberFixedPipe } from './number-fixed.pipe';

describe('NumberFixedPipe', () => {
  let pipe: NumberFixedPipe;

  beforeEach(() => {
    pipe = new NumberFixedPipe();
  });

  it('should create the pipe', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return 0 for null or empty string', () => {
    expect(pipe.transform(null)).toBe(0);
    expect(pipe.transform('')).toBe(0);
    expect(pipe.transform(undefined)).toBe(0);
  });

  it('should return the number as string without decimal when decimal is not provided', () => {
    expect(pipe.transform('123.456')).toBe('123.456');
    expect(pipe.transform(789)).toBe('789');
  });

  it('should return the number fixed to specified decimal places', () => {
    expect(pipe.transform('123.456', 2)).toBe('123.45');
    expect(pipe.transform('0.123456', 4)).toBe('0.1234');
    expect(pipe.transform(789.987, 1)).toBe('789.9');
  });

  it('should handle large numbers correctly', () => {
    const largeNum = '12345678901234567890.123456789';
    expect(pipe.transform(largeNum, 5)).toBe('12345678901234567890.12345');
  });

  it('should handle decimal = 0 correctly', () => {
    expect(pipe.transform('123.456', 0)).toBe('123');
  });
});
