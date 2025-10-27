import { parseUrl } from './app';

describe('parseUrl', () => {
  it('should parse simple query parameters correctly', () => {
    const result = parseUrl('https://example.com?name=John&age=30');
    expect(result).toEqual({ name: 'John', age: '30' });
  });

  it('should decode URL-encoded values', () => {
    const result = parseUrl('https://example.com?city=New%20York&note=Hello%20World%21');
    expect(result).toEqual({ city: 'New York', note: 'Hello World!' });
  });

  it('should handle URLs without query parameters', () => {
    const result = parseUrl('https://example.com');
    expect(result).toEqual({});
  });

  it('should handle query string starting with "?" only', () => {
    const result = parseUrl('?a=1&b=2');
    expect(result).toEqual({ a: '1', b: '2' });
  });

  it('should handle empty values', () => {
    const result = parseUrl('https://example.com?key=');
    expect(result).toEqual({ key: '' });
  });

  it('should handle multiple "=" in a value', () => {
    const result = parseUrl('https://example.com?token=a=b=c');
    expect(result).toEqual({ token: 'a=b=c' });
  });
});
