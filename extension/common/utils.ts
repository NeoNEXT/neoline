import WIF = require('wif');
import { ec } from 'elliptic';
import base58 = require('bs58');

const hexRegex = /^([0-9A-Fa-f]{2})*$/;

/**
 * @param arr
 * @returns HEX string
 */
export function ab2hexstring(arr) {
    if (typeof arr !== 'object') {
        throw new Error(`ab2hexstring expects an array. Input was ${arr}`);
    }
    let result = '';
    const intArray = new Uint8Array(arr);
    for (const i of intArray) {
        let str = i.toString(16);
        str = str.length === 0 ? '00' : str.length === 1 ? '0' + str : str;
        result += str;
    }
    return result;
}

export function getPrivateKeyFromWIF(wif) {
    return ab2hexstring(WIF.decode(wif, 128).privateKey);
}

export function getPublicKeyFromPrivateKey(privateKey, encode = true) {
    const privateKeyBuffer = Buffer.from(privateKey, 'hex');
    const curve = new ec('p256');
    const keypair = curve.keyFromPrivate(privateKeyBuffer, 'hex');
    const unencodedPubKey = (keypair.getPublic() as any).encode('hex');
    if (encode) {
        const tail = parseInt(unencodedPubKey.substr(64 * 2, 2), 16);
        if (tail % 2 === 1) {
            console.log( '03' + unencodedPubKey.substr(2, 64));
            return '03' + unencodedPubKey.substr(2, 64);
        } else {
            console.log('02' + unencodedPubKey.substr(2, 64));

            return '02' + unencodedPubKey.substr(2, 64);
        }
    } else {
        console.log(unencodedPubKey);
        return unencodedPubKey;
    }
}

export function getScriptHashFromAddress(address) {
    const hash = ab2hexstring(base58.decode(address));
    return reverseHex(hash.substr(2, 40));
}

export function reverseHex(hex) {
    ensureHex(hex);
    let out = '';
    for (let i = hex.length - 2; i >= 0; i -= 2) {
        out += hex.substr(i, 2);
    }
    return out;
}

export function ensureHex(str) {
    if (!isHex(str)) {
        throw new Error(`Expected a hexstring but got ${str}`);
    }
}

export function isHex(str) {
    try {
        return hexRegex.test(str);
    } catch (err) {
        return false;
    }
}
