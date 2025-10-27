import { NftTokenIdPipe } from './nft-tokenid.pipe';

describe('NftTokenIdPipe', () => {
  let pipe: NftTokenIdPipe;

  beforeEach(() => {
    pipe = new NftTokenIdPipe();
  });

  it('should create the pipe instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should truncate long token id (> 12 chars)', () => {
    const value = '1234567890abcdef';
    const result = pipe.transform(value);
    expect(result).toBe('123456...');
  });

  it('should return value if token id length <= 12', () => {
    const value = '123456789012';
    const result = pipe.transform(value);
    expect(result).toBe(value);
  });

  it('should return "-" if value is empty string', () => {
    const result = pipe.transform('');
    expect(result).toBe('-');
  });

  it('should return "-" if value is null', () => {
    const result = pipe.transform(null);
    expect(result).toBe('-');
  });

  it('should return "-" if value is undefined', () => {
    const result = pipe.transform(undefined);
    expect(result).toBe('-');
  });
});
