import { u, wallet } from '@cityofzion/neon-core-neo3';
import {
  buildNep20AuthenticationSignData,
  encodeNep21MessagePayload,
  isNep20ChallengeFresh,
  isNep20DomainTrusted,
  normalizeNep20Nonce,
  selectNep20Network,
  toUInt160Hex,
} from '@cross-runtime/neo3-sign-data';

describe('NEP-20 authentication sign data', () => {
  // Acceptance vector from the NEP-20 compatibility review.
  const challenge = {
    nonce: '1234567890123456789',
    timestamp: 1710000001,
    network: 894710606,
    address: 'NVHt5YtAnadMwntAVAJLUy36M2nLYKHUeK',
    action: 'Authentication',
    domain: 'test.nexo.example',
  };
  const publicKey =
    '036b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296';
  const signData =
    '1581e97df41022118187ec654e33543566de052617e55519358c3885e049e3d3e07efe7e' +
    '0e41757468656e7469636174696f6e11746573742e6e65786f2e6578616d706c65';

  it('serialises nonce, timestamp, network, scriptHash, action and domain', () => {
    expect(buildNep20AuthenticationSignData(challenge)).toBe(signData);
  });

  it('hashes to the expected SHA-256 digest', () => {
    expect(u.sha256(signData)).toBe(
      '3927aa5ab9853d8fa8209b1b47749661d6a1aff481b57aefafbc30b2e6c99ec7',
    );
  });

  it('produces a signature the challenge public key verifies', () => {
    const signature = u.base642hex(
      'SQulFepdhnVtCN5tebiE0/lMHPESOyCo9noxrmBDi+Nbw6WURIR3WfnPKo6I/2r7QXeV8numITL7RJUCuG3XJA==',
    );

    expect(wallet.verify(signData, signature, publicKey)).toBeTrue();
  });

  it('writes the script hash in UInt160 order, not display order', () => {
    expect(wallet.getScriptHashFromAddress(challenge.address)).toBe(
      '7efe7ee0d3e349e085388c351955e5172605de66',
    );
    expect(toUInt160Hex(challenge.address)).toBe(
      '66de052617e55519358c3885e049e3d3e07efe7e',
    );
  });

  it('keeps full uint64 precision for a nonce beyond Number.MAX_SAFE_INTEGER', () => {
    const signed = buildNep20AuthenticationSignData({
      ...challenge,
      nonce: '18446744073709551615',
    });

    expect(signed.slice(0, 16)).toBe('ffffffffffffffff');
  });

  it('rejects a nonce that does not fit in uint64', () => {
    expect(() =>
      buildNep20AuthenticationSignData({
        ...challenge,
        nonce: '18446744073709551616',
      }),
    ).toThrow();
  });

  it('length-prefixes action and domain as VarStrings', () => {
    const longDomain = `${'a'.repeat(300)}.example`;
    const signed = buildNep20AuthenticationSignData({
      ...challenge,
      domain: longDomain,
    });

    // 0xfd marks a two byte little endian length: 308 bytes -> fd3401.
    expect(signed.endsWith(`fd3401${u.str2hexstring(longDomain)}`)).toBeTrue();
  });
});

describe('selectNep20Network', () => {
  it('prefers the network the wallet is currently on', () => {
    expect(
      selectNep20Network([860833102, 894710606], [860833102, 894710606], 894710606),
    ).toBe(894710606);
  });

  it('falls back to the first shared network', () => {
    expect(
      selectNep20Network([894710606, 860833102], [860833102], 894710606),
    ).toBe(860833102);
  });

  it('returns undefined when nothing is shared', () => {
    expect(selectNep20Network([12345], [860833102], 860833102)).toBeUndefined();
  });
});

describe('isNep20DomainTrusted', () => {
  it('accepts the exact hostname', () => {
    expect(isNep20DomainTrusted('test.nexo.example', 'test.nexo.example')).toBeTrue();
  });

  it('rejects a parent of the requesting host', () => {
    expect(isNep20DomainTrusted('nexo.example', 'app.nexo.example')).toBeFalse();
  });

  it('rejects an origin in place of a bare hostname', () => {
    expect(
      isNep20DomainTrusted('https://test.nexo.example:8443', 'test.nexo.example'),
    ).toBeFalse();
    expect(
      isNep20DomainTrusted('%74est.nexo.example', 'test.nexo.example'),
    ).toBeFalse();
  });

  it('rejects an unrelated domain', () => {
    expect(isNep20DomainTrusted('nexo.example', 'evil.com')).toBeFalse();
  });

  it('rejects a suffix that is not a domain boundary', () => {
    expect(isNep20DomainTrusted('nexo.example', 'evilnexo.example')).toBeFalse();
  });

  it('rejects an empty domain or hostname', () => {
    expect(isNep20DomainTrusted('', 'nexo.example')).toBeFalse();
    expect(isNep20DomainTrusted('nexo.example', '')).toBeFalse();
  });
});

describe('isNep20ChallengeFresh', () => {
  const now = 1710000000;

  it('accepts a challenge within the skew window', () => {
    expect(isNep20ChallengeFresh(now - 60, now)).toBeTrue();
    expect(isNep20ChallengeFresh(now + 60, now)).toBeTrue();
  });

  it('rejects a stale challenge', () => {
    expect(isNep20ChallengeFresh(now - 601, now)).toBeFalse();
  });

  it('rejects a challenge dated too far in the future', () => {
    expect(isNep20ChallengeFresh(now + 601, now)).toBeFalse();
  });

  it('rejects a missing timestamp', () => {
    expect(isNep20ChallengeFresh(undefined as any, now)).toBeFalse();
  });

  it('rejects non-integer and out-of-uint32 timestamps', () => {
    expect(isNep20ChallengeFresh(now + 0.5, now)).toBeFalse();
    expect(isNep20ChallengeFresh(-1, now)).toBeFalse();
    expect(isNep20ChallengeFresh(0x100000000, 0x100000000)).toBeFalse();
  });
});

describe('normalizeNep20Nonce', () => {
  it('keeps a uint64 decimal string intact', () => {
    expect(normalizeNep20Nonce('18446744073709551615')).toBe(
      '18446744073709551615',
    );
  });

  it('accepts a number that is still exact', () => {
    expect(normalizeNep20Nonce(42)).toBe('42');
  });

  it('rejects a number that has already lost precision', () => {
    expect(normalizeNep20Nonce(1234567890123456789)).toBeUndefined();
  });

  it('rejects values beyond uint64 and non-numeric input', () => {
    expect(normalizeNep20Nonce('18446744073709551616')).toBeUndefined();
    expect(normalizeNep20Nonce('-1')).toBeUndefined();
    expect(normalizeNep20Nonce('0x1f')).toBeUndefined();
    expect(normalizeNep20Nonce(undefined)).toBeUndefined();
  });
});

describe('encodeNep21MessagePayload', () => {
  it('returns the base64 of the signed bytes for an ASCII message', () => {
    expect(encodeNep21MessagePayload('Hello, NEO!')).toEqual({
      hex: '48656c6c6f2c204e454f21',
      base64: 'SGVsbG8sIE5FTyE=',
    });
  });

  it('encodes non-ASCII messages as UTF-8', () => {
    expect(encodeNep21MessagePayload('你好')).toEqual({
      hex: 'e4bda0e5a5bd',
      base64: '5L2g5aW9',
    });
  });

  it('decodes the message when it is already base64', () => {
    expect(encodeNep21MessagePayload('5L2g5aW9', true)).toEqual({
      hex: 'e4bda0e5a5bd',
      base64: '5L2g5aW9',
    });
  });

  it('rejects malformed or non-canonical base64', () => {
    ['abc!', 'A===', '====', 'AB==', 'SGVsbG8'].forEach((message) => {
      expect(() => encodeNep21MessagePayload(message, true)).toThrow();
    });
  });
});
