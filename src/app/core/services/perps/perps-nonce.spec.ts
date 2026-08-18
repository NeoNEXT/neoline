import { isNonceRejection, PerpsNonceAllocator } from './perps-nonce';

describe('PerpsNonceAllocator', () => {
  it('never repeats a nonce for the same account within one millisecond', () => {
    const allocator = new PerpsNonceAllocator();
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) {
      seen.add(allocator.next('0xABC'));
    }

    expect(seen.size).toBe(50);
  });

  it('treats the same address case-insensitively', () => {
    const allocator = new PerpsNonceAllocator();
    const first = allocator.next('0xABC');
    const second = allocator.next('0xabc');

    expect(second).toBeGreaterThan(first);
  });

  it('keeps separate accounts independent', () => {
    // The exchange tracks nonces per signer, so one account's allocations must
    // not push another's forward.
    const allocator = new PerpsNonceAllocator();
    const first = allocator.next('0xaaa');
    const other = allocator.next('0xbbb');

    expect(Math.abs(other - first)).toBeLessThan(1000);
  });

  it('recognises a nonce refusal but not an unrelated rejection', () => {
    expect(isNonceRejection(new Error('Invalid nonce'))).toBeTrue();
    expect(isNonceRejection('nonce is too low')).toBeTrue();
    expect(isNonceRejection(new Error('Insufficient margin'))).toBeFalse();
    expect(isNonceRejection(undefined)).toBeFalse();
  });
});
