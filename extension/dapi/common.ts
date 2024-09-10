import { requestTarget, ERRORS, Provider } from '../common/data_module_neo2';
export { EVENT, ERRORS } from '../common/data_module_neo2';
import { getMessageID } from '../common/utils';
import { requestTargetN3 } from '../common/data_module_neo3';
import { requestTargetEVM } from '../common/data_module_evm';
import { ChainType } from '../common/constants';

export function sendMessage<K>(
  target: requestTarget | requestTargetN3 | requestTargetEVM,
  parameter?: any
): Promise<K> {
  const ID = getMessageID();
  return new Promise((resolveMain, rejectMain) => {
    const request = parameter ? { target, parameter, ID } : { target, ID };
    window.postMessage(request, window.location.origin);
    const promise = new Promise((resolve, reject) => {
      const callbackFn = (event) => {
        const returnData = event.data;
        if (
          returnData.return !== undefined &&
          returnData.return === target &&
          returnData.ID === ID
        ) {
          if (returnData.error !== undefined && returnData.error != null) {
            reject(returnData.error);
          } else {
            resolve(returnData.data);
          }
          window.removeEventListener('message', callbackFn);
        }
      };
      window.addEventListener('message', callbackFn);
    });
    promise
      .then((res: any) => {
        resolveMain(res);
      })
      .catch((error) => {
        rejectMain(error);
      });
  });
}

export async function checkConnectAndLogin(
  connectChain?: ChainType
): Promise<boolean> {
  const connected = await connect(connectChain);
  if (connected === true) {
    const isLogin = await login();
    if (isLogin === true) {
      return true;
    }
  }
  return false;
}

export function getProvider(): Promise<Provider> {
  return new Promise((resolveMain, rejectMain) => {
    window.postMessage(
      {
        target: requestTarget.Provider,
      },
      window.location.origin
    );
    const promise = new Promise((resolve) => {
      const callbackFn = (event) => {
        if (
          event.data.return !== undefined &&
          event.data.return === requestTarget.Provider
        ) {
          resolve(event.data.data);
          window.removeEventListener('message', callbackFn);
        }
      };
      window.addEventListener('message', callbackFn);
    });
    promise.then((res: any) => {
      if (res === undefined || res === null) {
        rejectMain(ERRORS.DEFAULT);
      } else {
        const returnResult: Provider = {
          name: res.name,
          version: res.version,
          website: 'https://neoline.io/',
          compatibility: [],
          extra: res.extra,
        };
        resolveMain(returnResult);
      }
    });
  });
}

export function getIcon() {
  return `${location.protocol}//${location.hostname}/favicon.ico`;
}

function connect(connectChain?: ChainType): Promise<boolean | any> {
  return new Promise((resolveMain) => {
    window.postMessage(
      {
        target: requestTarget.Connect,
        icon: getIcon(),
        hostname: location.hostname,
        title: document.title,
        connectChain,
      },
      window.location.origin
    );
    const promise = new Promise((resolve) => {
      const callbackFn = (event) => {
        if (
          event.data.return !== undefined &&
          event.data.return === requestTarget.Connect
        ) {
          resolve(event.data.data);
          window.removeEventListener('message', callbackFn);
        }
      };
      window.addEventListener('message', callbackFn);
    });
    promise.then((res: boolean | any) => {
      resolveMain(res);
    });
  });
}

export function login(): Promise<boolean | any> {
  return new Promise((resolveMain) => {
    window.postMessage(
      {
        target: requestTarget.Login,
      },
      window.location.origin
    );
    const promise = new Promise((resolve) => {
      const callbackFn = (event) => {
        if (
          event.data.return !== undefined &&
          event.data.return === requestTarget.Login
        ) {
          resolve(event.data.data);
          window.removeEventListener('message', callbackFn);
        }
      };
      window.addEventListener('message', callbackFn);
    });
    promise.then((res) => {
      resolveMain(res);
    });
  });
}
