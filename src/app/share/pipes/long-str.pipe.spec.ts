import { LongStrPipe } from './long-str.pipe';

describe('LongStrPipe', () => {
  let pipe: LongStrPipe;

  beforeEach(() => {
    pipe = new LongStrPipe();
  });

  it('should create the pipe instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return the original value if length <= len * 2', () => {
    const value = 'abcdef';
    expect(pipe.transform(value, 3)).toBe('abcdef');
  });

  it('should shorten a long string correctly with default len = 6', () => {
    const value = 'abcdefghijklmnopqrstuvwxyz';
    const result = pipe.transform(value);
    expect(result).toBe('abcdef...uvwxyz');
  });

  it('should shorten correctly when len = 4', () => {
    const value = '1234567890abcdef';
    const result = pipe.transform(value, 4);
    expect(result).toBe('1234...cdef');
  });

  it('should return the same value if input is shorter than 2 * len', () => {
    const value = '123456';
    expect(pipe.transform(value, 4)).toBe(value);
  });

  it('should return "-" when value is undefined', () => {
    expect(pipe.transform(undefined as any)).toBe('-');
  });

  it('should return "-" when value is null', () => {
    expect(pipe.transform(null as any)).toBe('-');
  });

  it('should return "-" if value is falsy and not caught by previous checks', () => {
    expect(pipe.transform('')).toBe('-');
  });
});
