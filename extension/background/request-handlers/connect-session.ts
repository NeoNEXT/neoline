import {
  requestTarget,
  ERRORS,
  AccountPublicKey,
} from '../../common/data_module_neo2';
import { requestTargetN3, Wallet3 } from '../../common/data_module_neo3';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { STORAGE_NAME, ConnectedWebsitesType } from '../../common/constants';
import {
  getStorage,
  getLocalStorage,
  getSessionStorage,
  setLocalStorage,
} from '../../common';
import {
  getPrivateKeyFromWIF,
  getPublicKeyFromPrivateKey,
} from '../../common/utils';
import { decryptSessionSecret } from '../../../cross-runtime/session-secret';
import { createWindow, windowCallback } from '../tool';
import { RequestHandlerModule } from './context';

const switchRequestChain: RequestHandlerModule = {
  targets: [requestTarget.SwitchRequestChain],
  handle: ({ request, chainType }) => {
    if (request.connectChain !== chainType) {
      createWindow(
        `wallet-switch-network?chainType=${request.connectChain}&messageID=${request.ID}&icon=${request.icon}&hostname=${request.hostname}`
      );
    } else {
      windowCallback({
        return: requestTarget.SwitchRequestChain,
        data: null,
        ID: request.ID,
      });
    }
    return true;
  },
};

const connect: RequestHandlerModule = {
  targets: [requestTarget.Connect],
  handle: ({ request, sendResponse }) => {
    getStorage(
      STORAGE_NAME.connectedWebsites,
      async (res: ConnectedWebsitesType) => {
        if (request.allowEdit === true) {
          const connectedNeoXIndex = Object.values(
            res?.[request.hostname]?.connectedAddress || {}
          ).findIndex((item) => item.chain === request.connectChain);
          if (connectedNeoXIndex >= 0) {
            windowCallback({
              return: requestTarget.Connect,
              data: true,
              ID: request.ID,
            });
          } else {
            createWindow(
              `authorization?icon=${request.icon}&hostname=${request.hostname}&title=${request.title}&allowEdit=${request.allowEdit}&connectChainType=${request.connectChain}&messageID=${request.ID}`
            );
          }
        } else {
          const currWallet = await getLocalStorage(
            STORAGE_NAME.wallet,
            () => {}
          );
          const currAddress = currWallet?.accounts?.[0].address;
          const existHost =
            res?.[request.hostname]?.connectedAddress?.[currAddress];
          if (existHost) {
            windowCallback({
              return: requestTarget.Connect,
              data: true,
              ID: request.ID,
            });
            // notification(
            //   `${chrome.i18n.getMessage('from')}: ${request.hostname}`,
            //   chrome.i18n.getMessage('connectedTip')
            // );
          } else {
            createWindow(
              `authorization?icon=${request.icon}&hostname=${request.hostname}&title=${request.title}&allowEdit=${request.allowEdit}&messageID=${request.ID}`
            );
          }
        }
        sendResponse('');
      }
    );
    return true;
  },
};

const login: RequestHandlerModule = {
  targets: [requestTarget.Login],
  handle: ({ request, sendResponse }) => {
    getSessionStorage('password', (pwd) => {
      if (pwd) {
        windowCallback({
          return: requestTarget.Login,
          data: true,
          ID: request.ID,
        });
      } else {
        createWindow(
          `/index.html#popup/login?notification=true&messageID=${request.ID}`,
          false
        );
      }
      sendResponse('');
    });
    return true;
  },
};

const accountPublicKey: RequestHandlerModule = {
  targets: [requestTarget.AccountPublicKey],
  handle: async ({ request, chainType }) => {
    try {
      const walletArrStorage =
        chainType === 'Neo2'
          ? STORAGE_NAME.walletArr
          : STORAGE_NAME['walletArr-Neo3'];
      const wifArrStorage =
        chainType === 'Neo2'
          ? STORAGE_NAME.WIFArr
          : STORAGE_NAME['WIFArr-Neo3'];
      const walletArr = await getLocalStorage(walletArrStorage, () => {});
      let currWallet = await getLocalStorage(STORAGE_NAME.wallet, () => {});
      currWallet =
        chainType === 'Neo2'
          ? new Wallet2(currWallet)
          : new Wallet3(currWallet);
      const WIFArr = await getLocalStorage(wifArrStorage, () => {});
      const data: AccountPublicKey = { address: '', publicKey: '' };
      if (currWallet !== undefined && currWallet.accounts[0] !== undefined) {
        if (currWallet.accounts[0]?.extra?.ledgerSLIP44) {
          data.publicKey = currWallet.accounts[0].extra.publicKey;
        } else {
          let wif =
            WIFArr[
              walletArr.findIndex(
                (item) =>
                  item.accounts[0].address === currWallet.accounts[0].address
              )
            ];
          if (!wif) {
            const storagePwd = await getSessionStorage('password', () => {});
            const pwd = await decryptSessionSecret(storagePwd);
            wif = (await (currWallet.accounts[0] as any).decrypt(pwd)).WIF;
          }
          const privateKey = getPrivateKeyFromWIF(wif);
          data.publicKey = getPublicKeyFromPrivateKey(privateKey);
        }
        data.address = currWallet.accounts[0].address;
      }
      windowCallback({
        return: requestTarget.AccountPublicKey,
        data,
        ID: request.ID,
      });
    } catch (error) {
      windowCallback({
        data: [],
        ID: request.ID,
        return: requestTarget.AccountPublicKey,
        error: { ...ERRORS.UNKNOWN, description: error?.message || error },
      });
    }
    return;
  },
};

const authenticate: RequestHandlerModule = {
  targets: [requestTargetN3.Authenticate],
  handle: async ({ request, sendResponse }) => {
    const params = request.parameter;
    const localData =
      (await getLocalStorage(STORAGE_NAME.InvokeArgsArray, () => {})) || {};
    const newData = { ...localData, [request.ID]: params };
    setLocalStorage({ [STORAGE_NAME.InvokeArgsArray]: newData });
    createWindow(`neo3-authenticate?messageID=${request.ID}`);

    sendResponse('');
    return;
  },
};

export default [
  switchRequestChain,
  connect,
  login,
  accountPublicKey,
  authenticate,
];
