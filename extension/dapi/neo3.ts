import { wallet } from '@cityofzion/neon-core-neo3';
import {
  Provider,
  Networks,
  Account,
  AccountPublicKey,
  ERRORS,
  requestTarget,
  WalletSwitchNetworkArg,
  WalletSwitchAccountArg,
} from '../common/data_module_neo2';
import {
  requestTargetN3,
  N3InvokeReadArgs,
  N3InvokeReadMultiArgs,
  N3InvokeArgs,
  N3InvokeMultipleArgs,
  N3BalanceArgs,
  N3ApplicationLogArgs,
  N3TransactionArgs,
  N3BalanceResults,
  N3TransactionDetails,
  N3GetBlockInputArgs,
  N3GetStorageArgs,
  N3StorageResponse,
  N3Response,
  N3SendArgs,
  N3SendOutput,
  N3VerifyMessageArgs,
  EVENT,
  N3AddressToScriptHash,
  N3ScriptHashToAddress,
} from '../common/data_module_neo3';
import { ChainType, ALL_CHAINID } from '../common/constants';
import {
  checkConnectAndLogin,
  sendMessage,
  getProvider,
  getIcon,
} from './common';

export class Init {
  public EVENT = EVENT;
  private EVENTLIST = {
    READY: {
      callback: [],
      callbackEvent: [],
    },
  };

  public getProvider(): Promise<Provider> {
    return new Promise((resolveMain, _) => {
      getProvider().then((res) => {
        resolveMain(res);
      });
    });
  }

  public getNetworks(): Promise<Networks> {
    return sendMessage(requestTarget.Networks);
  }

  public async getAccount(): Promise<Account> {
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTarget.Account);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async getPublicKey(): Promise<AccountPublicKey> {
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTarget.AccountPublicKey);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async AddressToScriptHash(
    parameter: N3AddressToScriptHash
  ): Promise<string> {
    if (parameter && !wallet.isAddress(parameter.address, 53)) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    } else {
      return sendMessage(requestTargetN3.AddressToScriptHash, parameter);
    }
  }

  public async ScriptHashToAddress(
    parameter: N3ScriptHashToAddress
  ): Promise<string> {
    if (
      parameter &&
      !wallet.isAddress(
        wallet.getAddressFromScriptHash(
          parameter.scriptHash.startsWith('0x')
            ? parameter.scriptHash.substring(2, 44)
            : parameter.scriptHash
        ),
        53
      )
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    } else {
      return sendMessage(requestTargetN3.ScriptHashToAddress, parameter);
    }
  }

  public getBalance(parameter: N3BalanceArgs): Promise<N3BalanceResults> {
    return sendMessage(requestTargetN3.Balance, parameter);
  }

  public getTransaction(
    parameter: N3TransactionArgs
  ): Promise<N3TransactionDetails> {
    if (parameter && parameter.txid === undefined) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    } else {
      return sendMessage(requestTargetN3.Transaction, parameter);
    }
  }

  public getBlock(parameter: N3GetBlockInputArgs) {
    if (parameter.blockHeight === undefined) {
      return new Promise((_, reject) => {
        reject(ERRORS.CONNECTION_DENIED);
      });
    } else {
      return sendMessage(requestTargetN3.Block, parameter);
    }
  }

  public getApplicationLog(parameter: N3ApplicationLogArgs) {
    if (parameter.txid === undefined) {
      return new Promise((_, reject) => {
        reject(ERRORS.CONNECTION_DENIED);
      });
    } else {
      return sendMessage(requestTargetN3.ApplicationLog, parameter);
    }
  }

  public async pickAddress(): Promise<Account> {
    const parameter = {
      hostname: location.hostname,
    };
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.PickAddress, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public getStorage(parameter: N3GetStorageArgs): Promise<N3StorageResponse> {
    if (
      parameter === undefined ||
      parameter.scriptHash === undefined ||
      parameter.key === undefined
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    } else {
      return sendMessage(requestTargetN3.Storage, parameter);
    }
  }

  public invokeRead(parameter: N3InvokeReadArgs): Promise<object> {
    if (
      parameter.scriptHash === undefined ||
      parameter.scriptHash === '' ||
      parameter.operation === undefined ||
      parameter.operation === '' ||
      parameter.signers === undefined ||
      !(parameter.signers instanceof Array)
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    } else {
      let flag = true;
      parameter.signers.map((item) => {
        if (item.account === undefined || item.scopes === undefined) {
          flag = false;
        }
      });
      if (!flag) {
        return new Promise((_, reject) => {
          reject(ERRORS.MALFORMED_INPUT);
        });
      }
      if (parameter.args === undefined) {
        parameter.args = [];
      }
      return sendMessage(requestTargetN3.InvokeRead, parameter);
    }
  }

  public invokeReadMulti(parameter: N3InvokeReadMultiArgs): Promise<object> {
    if (
      !(parameter.invokeReadArgs instanceof Array) ||
      parameter.signers === undefined ||
      !(parameter.signers instanceof Array)
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    } else {
      let flag = true;
      parameter.signers.map((item) => {
        if (item.account === undefined || item.scopes === undefined) {
          flag = false;
        }
      });
      if (!flag) {
        return new Promise((_, reject) => {
          reject(ERRORS.MALFORMED_INPUT);
        });
      }
      return sendMessage(requestTargetN3.InvokeReadMulti, parameter);
    }
  }

  public async verifyMessage(
    parameter: N3VerifyMessageArgs
  ): Promise<N3Response> {
    if (
      parameter.message === undefined ||
      parameter.data === undefined ||
      parameter.publicKey === undefined
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.VerifyMessage, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async verifyMessageV2(
    parameter: N3VerifyMessageArgs
  ): Promise<N3Response> {
    if (
      parameter.message === undefined ||
      parameter.data === undefined ||
      parameter.publicKey === undefined
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.VerifyMessageV2, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async invoke(parameter: N3InvokeArgs) {
    if (
      parameter.scriptHash === undefined ||
      parameter.scriptHash === '' ||
      parameter.operation === undefined ||
      parameter.operation === '' ||
      parameter.signers === undefined ||
      !(parameter.signers instanceof Array)
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    } else {
      let flag = true;
      parameter.signers.map((item) => {
        if (item.account === undefined || item.scopes === undefined) {
          flag = false;
        }
      });
      if (!flag) {
        return new Promise((_, reject) => {
          reject(ERRORS.MALFORMED_INPUT);
        });
      }
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      (parameter as any).hostname = location.hostname;
      return sendMessage(requestTargetN3.Invoke, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async signMessage(parameter: {
    message: string;
    isJsonObject?: boolean;
  }): Promise<any> {
    if (parameter.message === undefined) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.SignMessage, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async signMessageV2(parameter: {
    message: string;
    isJsonObject?: boolean;
  }): Promise<any> {
    if (parameter.message === undefined) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.SignMessageV2, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async signMessageWithoutSalt(parameter: {
    message: string;
    isJsonObject?: boolean;
  }): Promise<any> {
    if (parameter.message === undefined) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.SignMessageWithoutSalt, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async signMessageWithoutSaltV2(parameter: {
    message: string;
    isJsonObject?: boolean;
  }): Promise<any> {
    if (parameter.message === undefined) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.SignMessageWithoutSaltV2, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async signTransaction(parameter): Promise<any> {
    if (parameter.transaction === undefined) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.SignTransaction, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async send(parameter: N3SendArgs): Promise<N3SendOutput> {
    if (
      parameter === undefined ||
      parameter.toAddress === undefined ||
      parameter.fromAddress === undefined ||
      parameter.asset === undefined ||
      parameter.amount === undefined
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.CONNECTION_DENIED);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      return sendMessage(requestTargetN3.Send, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async invokeMultiple(parameter: N3InvokeMultipleArgs) {
    if (
      parameter.signers === undefined ||
      !(parameter.signers instanceof Array) ||
      parameter.invokeArgs === undefined
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    let flag = true;
    parameter.signers.map((item) => {
      if (item.account === undefined || item.scopes === undefined) {
        flag = false;
      }
    });
    if (!flag) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    if (
      parameter.invokeArgs instanceof Array &&
      parameter.invokeArgs.length > 0
    ) {
      parameter.invokeArgs.forEach((item) => {
        if (
          item.scriptHash === undefined ||
          item.scriptHash === '' ||
          item.operation === undefined ||
          item.operation === ''
        ) {
          return new Promise((_, reject) => {
            reject(ERRORS.MALFORMED_INPUT);
          });
        }
      });
    } else {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      (parameter as any).hostname = location.hostname;
      return sendMessage(requestTargetN3.InvokeMultiple, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async switchWalletNetwork(
    parameter: WalletSwitchNetworkArg
  ): Promise<any> {
    if (
      parameter.chainId === undefined ||
      !ALL_CHAINID.includes(parameter.chainId)
    ) {
      return new Promise((_, reject) => {
        reject(ERRORS.MALFORMED_INPUT);
      });
    }
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      parameter.hostname = location.hostname;
      parameter.icon = getIcon();
      parameter.chainType = ChainType.Neo3;
      return sendMessage(requestTargetN3.WalletSwitchNetwork, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public async switchWalletAccount(): Promise<any> {
    const isAuth = await checkConnectAndLogin(ChainType.Neo3);
    if (isAuth === true) {
      const parameter: WalletSwitchAccountArg = {
        hostname: location.hostname,
        icon: getIcon(),
        chainType: ChainType.Neo3,
      };
      return sendMessage(requestTargetN3.WalletSwitchAccount, parameter);
    }
    return Promise.reject(ERRORS.CONNECTION_DENIED);
  }

  public addEventListener(type: string, callback: (data: object) => void) {
    switch (type) {
      case this.EVENT.READY: {
        this.getProvider()
          .then((res) => {
            callback(res);
          })
          .catch((error) => {
            callback(error);
          });
        // const callbackFn = (event) => {
        //     if (event.data.return !== undefined && event.data.return === this.EVENT.READY) {
        //         callback(event.data.data);
        //     }
        // };
        // this.EVENTLIST.READY.callback.push(callback);
        // this.EVENTLIST.READY.callbackEvent.push(callbackFn);
        // window.addEventListener('message', this.EVENTLIST.READY[this.EVENTLIST.READY.callbackEvent.length - 1]);
        break;
      }
    }
  }
  public removeEventListener(type: string, removeFn: any) {
    switch (type) {
      case this.EVENT.READY: {
        // const index = this.EVENTLIST.READY.callback.findIndex(item => item === fn);
        // window.removeEventListener('message', this.EVENTLIST.READY.callbackEvent[index]);
        // this.EVENTLIST.READY.callback.splice(index, 1);
        // this.EVENTLIST.READY.callbackEvent.splice(index, 1);
        break;
      }
    }
  }
}

export const N3: any = new Init();

if (window.dispatchEvent) {
  getProvider()
    .then((res) => {
      window.dispatchEvent(
        new CustomEvent(EVENT.READY, {
          detail: res,
        })
      );
    })
    .catch((error) => {
      window.dispatchEvent(
        new CustomEvent(EVENT.READY, {
          detail: error,
        })
      );
    });
}

window.addEventListener('message', (e) => {
  const response = e.data;
  if (Object.values(EVENT).includes(response.return)) {
    window.dispatchEvent(
      new CustomEvent(response.return, {
        detail: response.data,
      })
    );
  }
});
