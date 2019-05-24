import WIF = require('wif');
import { ec } from 'elliptic';

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
            console.log( '03' + unencodedPubKey.substr(2, 64))
            return '03' + unencodedPubKey.substr(2, 64);
        } else {
            console.log('02' + unencodedPubKey.substr(2, 64))

            return '02' + unencodedPubKey.substr(2, 64);
        }
    } else {
        console.log(unencodedPubKey);
        return unencodedPubKey;
    }
}
