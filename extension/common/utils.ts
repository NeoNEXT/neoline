import WIF = require('wif');
import { ec } from 'elliptic';
import base58 = require('bs58');

import SHA256 =  require('crypto-js/sha256');
import hexEncoding = require('crypto-js/enc-hex');



const hexRegex = /^([0-9A-Fa-f]{2})*$/;

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
            return '03' + unencodedPubKey.substr(2, 64);
        } else {
            return '02' + unencodedPubKey.substr(2, 64);
        }
    } else {
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

export function sign(hex, privateKey) {
    const curve = new ec('p256');
    const msgHash = sha256(hex);
    const msgHashHex = Buffer.from(msgHash, 'hex');
    const privateKeyBuffer = Buffer.from(privateKey, 'hex');
    const sig = curve.sign(msgHashHex, privateKeyBuffer);
    return sig.r.toString('hex', 32) + sig.s.toString('hex', 32);
}

/**
 * Performs a single SHA256.
 */
export function sha256(hex) {
    return hash(hex, SHA256);
}

function hash(hex, hashingFunction) {
    const hexEncoded = hexEncoding.parse(hex);
    const result = hashingFunction(hexEncoded);
    return result.toString(hexEncoding);
}


/**
 * @param str ASCII string
 * @returns
 */
export function str2ab(str) {
    if (typeof str !== "string") {
        throw new Error(`str2ab expected a string but got ${typeof str} instead.`);
    }
    const result = new Uint8Array(str.length);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
        result[i] = str.charCodeAt(i);
    }
    return result;
}

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

/**
 * @param str ASCII string
 * @returns HEX string
 */
export function str2hexstring(str) {
    return ab2hexstring(str2ab(str));
}
