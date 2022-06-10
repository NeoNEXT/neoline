import { Injectable } from '@angular/core';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import {
    ChainType,
    LEDGER_PAGE_SIZE,
    DEFAULT_NEO2_ASSETS,
    DEFAULT_NEO3_ASSETS,
    NEO3_CONTRACT,
    GAS3_CONTRACT,
} from '@/app/popup/_lib';
import { wallet as wallet2 } from '@cityofzion/neon-core';
import { wallet as wallet3, u } from '@cityofzion/neon-core-neo3/lib';
import { Transaction as Transaction2 } from '@cityofzion/neon-core/lib/tx';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { tx as tx2 } from '@cityofzion/neon-core/lib';
import { tx as tx3 } from '@cityofzion/neon-core-neo3/lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { HttpService } from './http.service';
import { GlobalService } from './global.service';
import { NEO, GAS, Asset } from '@/models/models';
import { map } from 'rxjs/operators';
import BigNumber from 'bignumber.js';

export const LedgerStatuses = {
    UNSUPPORTED: 'UNSUPPORTED',
    DISCONNECTED: 'DISCONNECTED',
    APP_CLOSED: 'APP_CLOSED',
    READY: 'READY',
    TX_DENIED: 'TX_DENIED',
};
const LedgerReadyStatusCode = 0x9000;

@Injectable()
export class LedgerService {
    deviceInstance;
    accounts = { Neo2: [], Neo3: [] };
    sendQueue = [];
    ledgerInUse = false;

    constructor(private http: HttpService, private global: GlobalService) {}

    getLedgerBalance(address: string, chain: ChainType) {
        if (chain === 'Neo2') {
            const data = {
                jsonrpc: '2.0',
                method: 'getaccountstate',
                params: [address],
                id: 1,
            };
            return this.http
                .rpcPost(this.global.n2Network.rpcUrl, {
                    ...data,
                    method: 'getaccountstate',
                })
                .pipe(
                    map((nativeRes) => {
                        const result = [
                            { ...DEFAULT_NEO2_ASSETS.NEO },
                            { ...DEFAULT_NEO2_ASSETS.GAS },
                        ];
                        (nativeRes?.balances || []).forEach(
                            ({ asset, value }) => {
                                if (asset === NEO) {
                                    result[0].balance = value;
                                }
                                if (asset === GAS) {
                                    result[1].balance = value;
                                }
                            }
                        );
                        return result;
                    })
                );
        }
        const data = {
            jsonrpc: '2.0',
            method: 'getnep17balances',
            params: [address],
            id: 1,
        };
        return this.http.rpcPost(this.global.n3Network.rpcUrl, data).pipe(
            map((n3Res) => {
                const result: Asset[] = [
                    { ...DEFAULT_NEO3_ASSETS.NEO },
                    { ...DEFAULT_NEO3_ASSETS.GAS },
                ];
                (n3Res?.balance || []).forEach(({ amount, assethash }) => {
                    if (assethash === NEO3_CONTRACT) {
                        result[0].balance = amount;
                    }
                    if (assethash === GAS3_CONTRACT) {
                        result[1].balance = new BigNumber(amount)
                            .shiftedBy(-8)
                            .toFixed();
                    }
                });
                return result;
            })
        );
    }

    getDeviceStatus(chainType: ChainType): Promise<any> {
        return this.getAppName(chainType)
            .then(() => LedgerStatuses.READY)
            .catch((err) => {
                this.closeDevice();
                return LedgerStatuses[err] ? err : LedgerStatuses.APP_CLOSED;
            });
    }

    async fetchAccounts(page: number, chainType: ChainType) {
        const startingIndex = (page - 1) * LEDGER_PAGE_SIZE;
        const maxIndex = page * LEDGER_PAGE_SIZE;
        let newAccounts = [];

        for (let index = startingIndex; index < maxIndex; index++) {
            if (this.accounts[chainType][index]) {
                newAccounts.push(this.accounts[chainType][index]);
                continue;
            }
            const account = await this.getPublicKey(index, chainType);
            this.accounts[chainType][index] = account;
            newAccounts.push(account);
        }
        return newAccounts;
    }

    getLedgerSignedTx(
        unsignedTx: Transaction2 | Transaction3 | string,
        wallet: Wallet2 | Wallet3,
        chainType: ChainType,
        magicNumber?: number,
        signOnly = false
    ): Promise<any> {
        const txIsString = typeof unsignedTx === 'string';
        const serTx = txIsString ? unsignedTx : (unsignedTx as any).serialize(false);
        const extra = wallet.accounts[0].extra;
        if (chainType === 'Neo2') {
            if (signOnly) {
                return this.getNeo2Signature({
                    data: serTx,
                    addressIndex: extra.ledgerAddressIndex,
                });
            }
            const verificationScript =
                wallet2.getVerificationScriptFromPublicKey(extra.publicKey);
            return this.getNeo2Signature({
                data: serTx,
                addressIndex: extra.ledgerAddressIndex,
            })
                .then((res) => `40${res}`)
                .then((invocationScript) => {
                    (unsignedTx as Transaction2).addWitness(
                        new tx2.Witness({
                            invocationScript,
                            verificationScript,
                        })
                    );
                    return unsignedTx;
                });
        } else {
            if (signOnly) {
                return this.getNeo3Signature({
                    data: serTx,
                    magicNumber,
                    addressIndex: extra.ledgerAddressIndex,
                });
            }
            const verificationScript =
                wallet3.getVerificationScriptFromPublicKey(extra.publicKey);
            return this.getNeo3Signature({
                data: serTx,
                magicNumber,
                addressIndex: extra.ledgerAddressIndex,
            })
                .then((res) => `0c40${res}`)
                .then((invocationScript) => {
                    (unsignedTx as Transaction3).addWitness(
                        new tx3.Witness({
                            invocationScript,
                            verificationScript,
                        })
                    );
                    return unsignedTx;
                });
        }
    }

    //#region private function
    private getNeo2Signature({ data, addressIndex }) {
        try {
            data += this.BIP44(addressIndex);
            const chunks = data.match(/.{1,510}/g) || [];

            if (!chunks.length) {
                throw `Invalid data provided: ${data}`;
            }

            const sendChunks = (i = 0) => {
                const p = i === chunks.length - 1 ? '80' : '00';
                return this.send(`8002${p}00`, chunks[i]).then((res) => {
                    return p === '80' ? res : sendChunks(i + 1);
                });
            };

            return sendChunks()
                .then((res) => {
                    if (res === 0x9000) {
                        throw 'No more data but Ledger did not return signature!';
                    }
                    return res.toString('hex');
                })
                .then((res) => {
                    const ss = new u.StringStream(res);
                    ss.read(2);
                    ss.read(1);
                    const r = ss.readVarBytes();
                    ss.read(1);
                    const s = ss.readVarBytes();

                    const integers = [r, s].map((i) => {
                        if (i.length < 64) {
                            i = i.padStart(64, '0');
                        }
                        if (i.length > 64) {
                            i = i.substr(-64);
                        }
                        return i;
                    });

                    return integers.join('');
                });
        } catch (err) {
            return Promise.reject(err);
        }
    }
    private getNeo3Signature({
        data,
        addressIndex,
        magicNumber,
    }): Promise<any> {
        try {
            let chunks = data.match(/.{1,510}/g) || [];

            if (!chunks.length) {
                throw `Invalid data provided: ${data}`;
            }

            const networkData = u.num2hexstring(magicNumber, 4, true);
            chunks.unshift(networkData);

            const bip44String = this.BIP44(addressIndex);
            chunks.unshift(bip44String);

            const sendChunks = (i = 0) => {
                const p = i === chunks.length - 1 ? '00' : '80';
                let chunkIndex = i.toString(16).padStart(2, '0');
                return this.send(`8002${chunkIndex}${p}`, chunks[i]).then(
                    (res) => {
                        return p === '00' ? res : sendChunks(i + 1);
                    }
                );
            };

            return sendChunks()
                .then((res) => {
                    if (res.length <= 2) {
                        throw 'No more data but Ledger did not return signature!';
                    }
                    return res.toString('hex');
                })
                .then((res) => {
                    const ss = new u.StringStream(res);
                    ss.read(2);
                    ss.read(1);
                    const r = ss.readVarBytes();
                    ss.read(1);
                    const s = ss.readVarBytes();

                    const integers = [r, s].map((i) => {
                        if (i.length < 64) {
                            i = i.padStart(64, '0');
                        }
                        if (i.length > 64) {
                            i = i.substr(-64);
                        }
                        return i;
                    });

                    return integers.join('');
                });
        } catch (err) {
            return Promise.reject(err);
        }
    }
    private getPublicKey(addressIndex = 0, chainType: ChainType): Promise<any> {
        return this.send('80040000', this.BIP44(addressIndex))
            .then((res) => res.toString('hex').substring(0, 130))
            .then((key) => {
                return chainType === 'Neo2'
                    ? new wallet2.Account(key)
                    : new wallet3.Account(key);
            })
            .catch((err) => {
                this.closeDevice();
                throw LedgerStatuses[err] ? err : LedgerStatuses.APP_CLOSED;
            });
    }

    private send(params, msg): Promise<any> {
        return new Promise((resolve, reject) => {
            this.sendQueue.push(() => {
                const data = Buffer.from(msg, 'hex');
                const [cla, ins, p1, p2] = params
                    .match(/.{1,2}/g)
                    .map((i) => parseInt(i, 16));
                return this.getDevice()
                    .then((device) => {
                        return device.send(cla, ins, p1, p2, data, [
                            LedgerReadyStatusCode,
                        ]);
                    })
                    .then((buffer) => {
                        resolve(buffer);
                        return;
                    })
                    .catch((err) => {
                        if (
                            err.toString() ===
                                'Error: could not read from HID device' ||
                            err.statusCode === 27911
                        ) {
                            this.closeDevice();
                        }
                        this.ledgerInUse = false;
                        reject(err);
                        throw err;
                    });
            });
            this.executeSend();
        });
    }

    private async getDevice(): Promise<any> {
        if (this.deviceInstance) {
            return this.deviceInstance;
        }
        this.deviceInstance = await TransportWebHID.create();
        this.deviceInstance.on('disconnect', () => {
            console.log('disconnect-----');
            this.closeDevice();
        });
        if (this.deviceInstance) {
            return this.deviceInstance;
        }
        throw LedgerStatuses.DISCONNECTED;
    }

    private getAppName(chainType: ChainType): Promise<any> {
        return new Promise((resolve, reject) => {
            this.sendQueue.push(() => {
                return this.getDevice()
                    .then((device) => {
                        return device.send(0x80, 0x00, 0x00, 0x00, undefined, [
                            LedgerReadyStatusCode,
                        ]);
                    })
                    .then((buffer) => {
                        const version = buffer.toString('ascii');
                        let appName = null;
                        if (version && version.length > 2) {
                            appName = version.substring(0, version.length - 2);
                        }
                        if (chainType === 'Neo3') {
                            if (
                                appName === 'NEO N3' ||
                                appName === 'NEO -DN3'
                            ) {
                                resolve('open');
                            } else {
                                reject(LedgerStatuses.APP_CLOSED);
                            }
                        } else {
                            reject(LedgerStatuses.APP_CLOSED);
                        }
                        return;
                    })
                    .catch((err) => {
                        if (
                            err.toString() ===
                                'Error: could not read from HID device' ||
                            err.statusCode === 27911
                        ) {
                            this.closeDevice();
                        }
                        if (chainType === 'Neo2') {
                            if (
                                err.statusCode === 27904 ||
                                err.statusText === 'INS_NOT_SUPPORTED'
                            ) {
                                resolve('open');
                            } else {
                                // console.log(err);
                                reject(err);
                            }
                        } else {
                            // console.log(err);
                            reject(err);
                        }
                        return;
                    });
            });
            this.executeSend();
        });
    }

    private executeSend() {
        if (this.ledgerInUse || this.sendQueue.length === 0) {
            return;
        }
        this.ledgerInUse = true;
        this.sendQueue[0]()
            .then((res) => {
                this.sendQueue.shift();
                this.ledgerInUse = false;
                this.executeSend();
            })
            .catch((err) => {
                this.sendQueue.shift();
                this.ledgerInUse = false;
                this.executeSend();
            });
    }

    private BIP44(index = 0): string {
        // https://github.com/bitcoin/bips/blob/master/bip-0043.mediawiki
        const purpose = '8000002C';
        const SLIP44 = '80000378'; // NEO
        // https://github.com/satoshilabs/slips/blob/master/slip-0044.md
        const account = '80000000';
        const change = '00000000';

        const indexHex = index.toString(16);
        const addressIndex = '0'.repeat(8 - indexHex.length) + indexHex;
        return purpose + SLIP44 + account + change + addressIndex;
    }

    private closeDevice(): void {
        this.deviceInstance && this.deviceInstance.close();
        this.deviceInstance = null;
        this.sendQueue = [];
    }
    //#endregion
}
