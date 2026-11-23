import { Injectable } from '@angular/core';
import {
  ChainType,
  LEDGER_PAGE_SIZE,
  DEFAULT_NEO2_ASSETS,
  DEFAULT_NEO3_ASSETS,
  NEO3_CONTRACT,
  GAS3_CONTRACT,
  RpcNetwork,
} from '@/app/popup/_lib';
import { wallet as wallet2 } from '@cityofzion/neon-core';
import { wallet as wallet3, u } from '@cityofzion/neon-core-neo3/lib';
import { Transaction as Transaction2 } from '@cityofzion/neon-core/lib/tx';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { tx as tx2 } from '@cityofzion/neon-core/lib';
import { tx as tx3 } from '@cityofzion/neon-core-neo3/lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { NEO, GAS, Asset } from '@/models/models';
import { filter, map } from 'rxjs/operators';
import BigNumber from 'bignumber.js';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { ethers } from 'ethers';
import { firstValueFrom, Observable, Subscription } from 'rxjs';
import { TypedMessage, MessageTypes } from '@metamask/eth-sig-util';
import { HttpService } from '../http.service';
import { GlobalService } from '../global.service';
import * as Sentry from '@sentry/angular';

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
  private dmk;
  private ethSigner;
  private sessionId: string;
  private devicePromise: Promise<string>;
  private closePromise: Promise<void>;
  private deviceStateSub: Subscription;
  private cancelNeoXAction: () => void;
  private accounts = { Neo2: [], Neo3: [], NeoX: [] };
  private sendQueue = [];
  private ledgerInUse = false;

  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  private neoXNetwork: RpcNetwork;
  constructor(
    private http: HttpService,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
    });
  }

  getLedgerBalance(address: string, chain: ChainType) {
    if (chain === 'Neo2') {
      const data = {
        jsonrpc: '2.0',
        method: 'getaccountstate',
        params: [address],
        id: 1,
      };
      return this.http
        .rpcPost(this.n2Network.rpcUrl, {
          ...data,
          method: 'getaccountstate',
        })
        .pipe(
          map((nativeRes) => {
            const result = [
              { ...DEFAULT_NEO2_ASSETS.NEO },
              { ...DEFAULT_NEO2_ASSETS.GAS },
            ];
            (nativeRes?.balances || []).forEach(({ asset, value }) => {
              if (asset === NEO) {
                result[0].balance = value;
              }
              if (asset === GAS) {
                result[1].balance = value;
              }
            });
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
    return this.http.rpcPost(this.n3Network.rpcUrl, data).pipe(
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
            result[1].balance = new BigNumber(amount).shiftedBy(-8).toFixed();
          }
        });
        return result;
      })
    );
  }

  getDeviceStatus(chainType: ChainType): Promise<any> {
    if (chainType === 'NeoX') {
      return this.getNeoXSigner()
        .then(async () => {
          const { GetAppAndVersionCommand, isSuccessCommandResult } =
            await import('@ledgerhq/device-management-kit');
          const result = await this.dmk.sendCommand({
            sessionId: this.sessionId,
            command: new GetAppAndVersionCommand(),
          });
          return isSuccessCommandResult(result) && result.data.name === 'Ethereum'
            ? LedgerStatuses.READY
            : LedgerStatuses.APP_CLOSED;
        })
        .catch((error) => {
          if (
            error === LedgerStatuses.UNSUPPORTED ||
            error === LedgerStatuses.DISCONNECTED ||
            error?._tag === 'NoAccessibleDeviceError'
          ) {
            return error === LedgerStatuses.UNSUPPORTED
              ? LedgerStatuses.UNSUPPORTED
              : LedgerStatuses.DISCONNECTED;
          }
          return LedgerStatuses.APP_CLOSED;
        });
    }
    const queue = this.sendQueue;
    return this.getAppName(chainType)
      .then(() => LedgerStatuses.READY)
      .catch((err) => {
        if (this.sendQueue === queue) {
          this.closeDevice();
        }
        return LedgerStatuses[err] ? err : LedgerStatuses.APP_CLOSED;
      });
  }

  async fetchAccounts(page: number, chainType: ChainType) {
    const signer = chainType === 'NeoX' ? await this.getNeoXSigner() : undefined;
    const startingIndex = (page - 1) * LEDGER_PAGE_SIZE;
    const maxIndex = page * LEDGER_PAGE_SIZE;
    let newAccounts = [];

    for (let index = startingIndex; index < maxIndex; index++) {
      if (this.accounts[chainType][index]) {
        newAccounts.push(this.accounts[chainType][index]);
        continue;
      }
      let account;
      if (chainType === 'NeoX') {
        account = await this.waitForNeoXAction(
          signer.getAddress(`44'/60'/0'/0/${index}`)
        );
      } else {
        account = await this.getPublicKey(index, chainType);
      }
      this.accounts[chainType][index] = account;
      newAccounts.push(account);
    }
    return newAccounts;
  }

  getLedgerSignedTx(
    unsignedTx:
      | Transaction2
      | Transaction3
      | string
      | ethers.TransactionRequest,
    wallet: Wallet2 | Wallet3 | EvmWalletJSON,
    chainType: ChainType,
    magicNumber?: number,
    signOnly = false
  ): Promise<any> {
    if (chainType === 'NeoX') {
      return this.getNeoXSignature(unsignedTx, wallet as EvmWalletJSON);
    }

    const txIsString = typeof unsignedTx === 'string';
    const serTx = txIsString
      ? unsignedTx
      : (unsignedTx as any).serialize(false);
    const extra = wallet.accounts[0].extra;
    if (chainType === 'Neo2') {
      if (signOnly) {
        return this.getNeo2Signature({
          data: serTx,
          addressIndex: extra.ledgerAddressIndex,
        });
      }
      const verificationScript = wallet2.getVerificationScriptFromPublicKey(
        extra.publicKey
      );
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
      return this.getNeo3Signature({
        data: serTx,
        magicNumber,
        addressIndex: extra.ledgerAddressIndex,
      }).then((signature) => {
        if (signOnly) {
          return signature;
        }
        const invocationScript = `0c40${signature}`;
        const verificationScript = wallet3.getVerificationScriptFromPublicKey(
          extra.publicKey
        );
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

  handleLedgerError(error) {
    console.log(error);
    let snackError = 'TransactionDeniedByUser';
    if (error && error.message) {
      snackError = error.message;
    }
    Sentry.captureMessage(`handleLedgerError: ${snackError}`);
    this.global.snackBarTip(snackError);
  }

  async getNeoXSignPersonalMessage(message: string, wallet: EvmWalletJSON) {
    const signer = await this.getNeoXSigner();
    const result = await this.waitForNeoXAction(
      signer.signMessage(
        `44'/60'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
        message
      )
    );
    return this.handleSignResult(result);
  }
  async getNeoXSignTypedData(
    typedData: TypedMessage<MessageTypes>,
    wallet: EvmWalletJSON
  ) {
    const signer = await this.getNeoXSigner();
    const result = await this.waitForNeoXAction(
      signer.signTypedData(
        `44'/60'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
        typedData
      )
    );
    return this.handleSignResult(result);
  }

  //#region private function
  private async getNeoXSigner(): Promise<any> {
    const sessionId = await this.getDevice();
    if (!this.ethSigner) {
      const { SignerEthBuilder } = await import('@ledgerhq/device-signer-kit-ethereum');
      if (this.sessionId !== sessionId) throw LedgerStatuses.DISCONNECTED;
      this.ethSigner = new SignerEthBuilder({ dmk: this.dmk, sessionId }).build();
    }
    return this.ethSigner;
  }

  cancel() {
    this.cancelNeoXAction?.();
    void this.closeDevice();
  }

  private async waitForNeoXAction(action: {
    observable: Observable<{ status: string; output?: any; error?: unknown }>;
    cancel: () => void;
  }): Promise<any> {
    this.cancelNeoXAction = action.cancel;
    try {
      const state = await firstValueFrom(
        action.observable.pipe(
          filter((value) => value.status === 'completed' ||
            value.status === 'error' || value.status === 'stopped')
        )
      );
      if (state.status === 'completed') return state.output;
      if (state.status === 'error') throw state.error;
      throw new Error('TransactionDeniedByUser');
    } finally {
      if (this.cancelNeoXAction === action.cancel) {
        this.cancelNeoXAction = undefined;
      }
    }
  }

  private handleSignResult(result: { r: string; s: string; v: number }) {
    return ethers.Signature.from(result).serialized;
  }

  private async getNeoXSignature(txData, wallet: EvmWalletJSON) {
    const signer = await this.getNeoXSigner();
    txData.chainId = this.neoXNetwork.chainId;
    const unsignedTx = ethers.Transaction.from(txData).unsignedSerialized;
    const result = await this.waitForNeoXAction(
      signer.signTransaction(
        `44'/60'/0'/0/${wallet.accounts[0].extra.ledgerAddressIndex}`,
        ethers.getBytes(unsignedTx)
      )
    );
    return {
      ...txData,
      signature: result,
    };
  }
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
  private getNeo3Signature({ data, addressIndex, magicNumber }): Promise<any> {
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
        return this.send(`8002${chunkIndex}${p}`, chunks[i]).then((res) => {
          return p === '00' ? res : sendChunks(i + 1);
        });
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
    const queue = this.sendQueue;
    return this.send('80040000', this.BIP44(addressIndex))
      .then((res) => res.toString('hex').substring(0, 130))
      .then((key) => {
        return chainType === 'Neo2'
          ? new wallet2.Account(key)
          : new wallet3.Account(key);
      })
      .catch((err) => {
        if (this.sendQueue === queue) {
          this.closeDevice();
        }
        throw LedgerStatuses[err] ? err : LedgerStatuses.APP_CLOSED;
      });
  }

  private send(params: string, msg: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const queue = this.sendQueue;
      const execute = async () => {
        try {
          const sessionId = await this.getDevice();
          if (this.sendQueue !== queue) throw LedgerStatuses.DISCONNECTED;
          const data = Buffer.from(msg, 'hex');
          const apdu = Buffer.concat([
            Buffer.from(params, 'hex'),
            Buffer.from([data.length]),
            data,
          ]);
          let response;
          try {
            response = await this.dmk.sendApdu({ sessionId, apdu });
          } catch {
            if (this.sessionId === sessionId) void this.closeDevice();
            throw LedgerStatuses.DISCONNECTED;
          }
          if (this.sendQueue !== queue) throw LedgerStatuses.DISCONNECTED;
          const status = Buffer.from(response.statusCode);
          const statusCode = status.readUInt16BE(0);
          if (statusCode !== LedgerReadyStatusCode) {
            if (statusCode === 27911) void this.closeDevice();
            throw Object.assign(
              new Error(`Ledger device returned 0x${status.toString('hex')}`),
              { statusCode }
            );
          }
          // Existing Neo parsers expect the response payload followed by SW1/SW2.
          resolve(Buffer.concat([Buffer.from(response.data), status]));
        } catch (error) {
          reject(error);
          throw error;
        }
      };
      queue.push({ execute, reject });
      this.executeSend();
    });
  }

  private getDevice(): Promise<string> {
    if (this.devicePromise) return this.devicePromise;
    if (this.sessionId) return Promise.resolve(this.sessionId);
    const queue = this.sendQueue;
    this.devicePromise = (async () => {
      await this.closePromise;
      const hid = (navigator as any).hid;
      if (!hid) throw LedgerStatuses.UNSUPPORTED;
      const [
        { DeviceManagementKitBuilder, LEDGER_VENDOR_ID, DeviceStatus },
        { webHidTransportFactory },
      ] = await Promise.all([
        import('@ledgerhq/device-management-kit'),
        import('@ledgerhq/device-transport-kit-web-hid'),
      ]);
      if (!this.dmk) {
        this.dmk = new DeviceManagementKitBuilder()
          .addTransport(webHidTransportFactory)
          .build();
      }
      const authorized = (await hid.getDevices()).some(
        (device) => device.vendorId === LEDGER_VENDOR_ID
      );
      const device = authorized
        ? (await firstValueFrom<any[]>(
            this.dmk.listenToAvailableDevices({}).pipe(
              filter((devices: any[]) => devices.length > 0)
            )
          ))[0]
        : await firstValueFrom(this.dmk.startDiscovering({}));
      const sessionId = await this.dmk.connect({
        device,
        // Background app probes must not interrupt Neo's multi-APDU signing.
        sessionRefresherOptions: { isRefresherDisabled: true },
      });
      if (this.sendQueue !== queue) {
        await this.dmk.disconnect({ sessionId });
        throw LedgerStatuses.DISCONNECTED;
      }
      this.sessionId = sessionId;
      this.accounts = { Neo2: [], Neo3: [], NeoX: [] };
      this.deviceStateSub = this.dmk.getDeviceSessionState({ sessionId }).subscribe(
        (state) => {
          if (this.sessionId === sessionId &&
              state.deviceStatus === DeviceStatus.NOT_CONNECTED) {
            void this.closeDevice();
          }
        }
      );
      return sessionId;
    })().catch((error) => {
      throw error?._tag === 'NoAccessibleDeviceError'
        ? LedgerStatuses.DISCONNECTED
        : error;
    }).finally(() => {
      this.devicePromise = undefined;
    });
    return this.devicePromise;
  }

  private getAppName(chainType: ChainType): Promise<string> {
    return this.send('80000000', '')
      .then((buffer) => {
        const appName = buffer.subarray(0, -2).toString('ascii');
        if (chainType === 'Neo3' &&
            (appName === 'NEO N3' || appName === 'NEO -DN3')) {
          return 'open';
        }
        throw LedgerStatuses.APP_CLOSED;
      })
      .catch((error) => {
        // The legacy Neo app identifies itself by rejecting this instruction.
        if (chainType === 'Neo2' && error.statusCode === 27904) return 'open';
        throw error;
      });
  }

  private executeSend() {
    if (this.ledgerInUse || this.sendQueue.length === 0) {
      return;
    }
    this.ledgerInUse = true;
    const request = this.sendQueue[0];
    request.execute()
      .then((res) => {
        if (this.sendQueue[0] !== request) return;
        this.sendQueue.shift();
        this.ledgerInUse = false;
        this.executeSend();
      })
      .catch((err) => {
        if (this.sendQueue[0] !== request) return;
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

  private closeDevice(): Promise<void> {
    const sessionId = this.sessionId;
    this.sessionId = undefined;
    this.ethSigner = undefined;
    this.deviceStateSub?.unsubscribe();
    this.deviceStateSub = undefined;
    this.accounts = { Neo2: [], Neo3: [], NeoX: [] };
    const requests = this.sendQueue;
    this.sendQueue = [];
    this.ledgerInUse = false;
    requests.forEach((request) => request.reject(LedgerStatuses.DISCONNECTED));
    if (sessionId) {
      this.closePromise = this.dmk.disconnect({ sessionId }).catch(() => undefined);
    }
    return this.closePromise || Promise.resolve();
  }
  //#endregion
}
