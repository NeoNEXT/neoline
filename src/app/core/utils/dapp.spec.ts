import { convertSignersToObj, convertValueToString } from './dapp';
import { tx } from '@cityofzion/neon-core-neo3';

describe('dapp', () => {
  it('should convert value to string for Any', () => {
    const args = { type: 'Any', value: null };

    const result = convertValueToString(args);
    expect(result).toBe(`null`);
  });

  it('should convert value to string for Boolean', () => {
    const args = { type: 'Boolean', value: true };
    const result = convertValueToString(args);
    expect(result).toBe(`true`);
  });

  it('should convert value to string for Integer', () => {
    const args = { type: 'Integer', value: '123456789' };
    const result = convertValueToString(args);
    expect(result).toBe(`123456789`);
  });

  it('should convert value to string for ByteArray', () => {
    const args = { type: 'ByteArray', value: '0abc55ee' };
    const result = convertValueToString(args);
    expect(result).toBe(`0abc55ee`);
  });

  it('should convert value to string for String', () => {
    const args = { type: 'String', value: 'hello world' };
    const result = convertValueToString(args);
    expect(result).toBe(`hello world`);
  });

  it('should convert value to string for Hash160', () => {
    const args = {
      type: 'Hash160',
      value: 'f61eebf573ea36593fd43aa150c055ad7906ab83',
    };
    const result = convertValueToString(args);
    expect(result).toBe(`f61eebf573ea36593fd43aa150c055ad7906ab83`);
  });

  it('should convert value to string for Hash256', () => {
    const args = {
      type: 'Hash256',
      value: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd',
    };
    const result = convertValueToString(args);
    expect(result).toBe(
      `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd`
    );
  });

  it('should convert value to string for PublicKey', () => {
    const args = {
      type: 'PublicKey',
      value:
        '03b209fd4f09eef09f34a021385c6f934c90fe2ffabe8c64a0ecb09e84e8d7f1fb',
    };
    const result = convertValueToString(args);
    expect(result).toBe(
      `03b209fd4f09eef09f34a021385c6f934c90fe2ffabe8c64a0ecb09e84e8d7f1fb`
    );
  });

  it('should convert value to string for Array  ', () => {
    const args = {
      type: 'Array',
      value: [
        { type: 'String', value: 'nested1' },
        { type: 'Integer', value: '999' },
        {
          type: 'Array',
          value: [
            { type: 'Boolean', value: false },
            { type: 'String', value: 'deep nested' },
          ],
        },
      ],
    };
    const result = convertValueToString(args);
    expect(result).toBe(`[nested1, 999, [false, deep nested]]`);
  });

    it('should convert value to string for Void', () => {
    const args = { type: 'Void' };

    const result = convertValueToString(args);
    expect(result).toBe(``);
  });

  it('should convert value to string for Map', () => {
    const args = {
      type: 'Map',
      value: [
        {
          key: { type: 'String', value: 'key1' },
          value: { type: 'Integer', value: '100' },
        },
        {
          key: { type: 'String', value: 'key2' },
          value: {
            type: 'Array',
            value: [
              { type: 'Boolean', value: true },
              { type: 'String', value: 'map nested' },
            ],
          },
        },
      ],
    };
    const result = convertValueToString(args);
    expect(result).toBe(
      `[{"key":"key1","value":"100"},{"key":"key2","value":"[true, map nested]"}]`
    );
  });

  it('should convert signers to object for CustomContracts', () => {
    const signers: tx.SignerLike[] = [
      {
        account: '0x127981b74544585839052fc7f2fdc126c92fa47e',

        // WitnessScope: CustomContracts
        scopes: 16,

        // allowedContracts: when scopes contains CustomContracts, it must be provided
        allowedContracts: [
          '0xd2a4cff31913016155e38e474a2c06d08be276cf',
          '0x3b9d5bb5c79f94b2074fa1bd89e2a1d13fb55a21',
        ],

        // WitnessRules: example
        rules: [
          {
            action: 'Allow',
            condition: {
              type: 'CalledByContract',
              hash: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
            },
          },
          {
            action: 'Deny',
            condition: {
              type: 'Boolean',
              expression: false,
            },
          },
        ],
      },
    ];
    const result = convertSignersToObj(signers);
    expect(result).toEqual([
      {
        name: 'account',
        value: '"0x127981b74544585839052fc7f2fdc126c92fa47e"',
      },
      { name: 'scopes', value: '16' },
      {
        name: 'allowedContracts',
        value:
          '["0xd2a4cff31913016155e38e474a2c06d08be276cf","0x3b9d5bb5c79f94b2074fa1bd89e2a1d13fb55a21"]',
      },
      {
        name: 'rules',
        value:
          '[{"action":"Allow","condition":{"type":"CalledByContract","hash":"0xd2a4cff31913016155e38e474a2c06d08be276cf"}},{"action":"Deny","condition":{"type":"Boolean","expression":false}}]',
      },
    ]);
  });

  it('should convert signers to object for CustomGroups', () => {
    const signers: tx.SignerLike[] = [
      {
        account: '0x127981b74544585839052fc7f2fdc126c92fa47e',

        // WitnessScope: CustomGroups
        scopes: 32,

        // allowedGroups: when scopes contains CustomGroups, it must be provided (public key)
        allowedGroups: [
          '03e8d1c79cd13af77b4f8386781edca264354ba6fdd2d562e2f1d1e45df1a3d55e',
        ],
      },
    ];
    const result = convertSignersToObj(signers);
    expect(result).toEqual([
      {
        name: 'account',
        value: '"0x127981b74544585839052fc7f2fdc126c92fa47e"',
      },
      { name: 'scopes', value: '32' },
      {
        name: 'allowedGroups',
        value:
          '["03e8d1c79cd13af77b4f8386781edca264354ba6fdd2d562e2f1d1e45df1a3d55e"]',
      },
    ]);
  });
});
