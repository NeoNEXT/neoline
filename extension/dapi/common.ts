import { requestTarget, ERRORS, Provider } from '../common/data_module_neo2';
export { EVENT, ERRORS } from '../common/data_module_neo2';
import { getMessageID } from '../common/utils';
import { requestTargetN3 } from '../common/data_module_neo3';
import { requestTargetEVM } from '../common/data_module_evm';
import { ChainType } from '../common/constants';

export function sendMessage<K>(
  target: requestTarget | requestTargetN3 | requestTargetEVM,
  parameter?: any,
): Promise<K> {
  const ID = getMessageID();
  return new Promise((resolveMain, rejectMain) => {
    const request = parameter ? { target, parameter, ID } : { target, ID };
    window.postMessage(
      { ...request, hostname: location.hostname },
      window.location.origin,
    );
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
  connectChain: ChainType,
  allowEdit = false,
): Promise<boolean> {
  const connected = await connect(connectChain, allowEdit);
  if (connected === true) {
    const isLogin = await login();
    if (isLogin === true) {
      return true;
    }
  }
  return false;
}

export async function checkNeoXConnectAndLogin(
  connectChain: ChainType,
  allowEdit = false,
): Promise<boolean> {
  const isSwitchToRequestChain = await switchToRequestChain(connectChain);
  if (isSwitchToRequestChain === true) {
    const connected = await connect(connectChain, allowEdit);
    if (connected === true) {
      const isLogin = await login();
      if (isLogin === true) {
        return true;
      }
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
      window.location.origin,
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
        rejectMain(ERRORS.NO_PROVIDER);
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

/**
 * Resolves once per page and is memoized: the favicon rarely changes, and
 * hostInfo is rebuilt on every request, so validating it each time would add
 * image-load latency to every JSON-RPC call.
 */
let iconPromise: Promise<string> | undefined;

export function getIcon(): Promise<string> {
  if (!iconPromise) {
    iconPromise = resolveIcon();
  }
  return iconPromise;
}

async function resolveIcon(): Promise<string> {
  const candidates = Array.from(
    document.querySelectorAll(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
    ),
  ).map((el) => (el as HTMLLinkElement).href);
  candidates.push(`${location.origin}/favicon.ico`);
  for (const href of candidates) {
    if (href && (await imgExists(href))) {
      return href;
    }
  }
  return '';
}

/**
 * Returns true only if the URL actually loads as an image. This drops broken
 * links and non-image URLs (e.g. `javascript:` favicons never fire `onload`).
 * A short timeout keeps a slow/hanging favicon from blocking the dApp request.
 */
function imgExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 1500);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

async function connect(
  connectChain: ChainType,
  allowEdit: boolean,
): Promise<boolean | any> {
  const ID = getMessageID();
  const icon = await getIcon();
  return new Promise((resolveMain, rejectMain) => {
    window.postMessage(
      {
        target: requestTarget.Connect,
        icon,
        hostname: location.hostname,
        title: document.title,
        connectChain,
        allowEdit,
        ID,
      },
      window.location.origin,
    );
    const promise = new Promise((resolve, reject) => {
      const callbackFn = (event) => {
        if (
          event.data.return !== undefined &&
          event.data.return === requestTarget.Connect &&
          event.data.ID === ID
        ) {
          if (event.data.error) {
            reject(event.data.error);
          } else {
            resolve(event.data.data === true);
          }
          window.removeEventListener('message', callbackFn);
        }
      };
      window.addEventListener('message', callbackFn);
    });
    promise.then(resolveMain).catch(rejectMain);
  });
}

export function login(): Promise<boolean | any> {
  const ID = getMessageID();
  return new Promise((resolveMain) => {
    window.postMessage(
      {
        target: requestTarget.Login,
        ID,
      },
      window.location.origin,
    );
    const promise = new Promise((resolve) => {
      const callbackFn = (event) => {
        if (
          event.data.return !== undefined &&
          event.data.return === requestTarget.Login &&
          event.data.ID === ID
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

async function switchToRequestChain(
  connectChain: ChainType,
): Promise<boolean | any> {
  const ID = getMessageID();
  const icon = await getIcon();
  return new Promise((resolveMain, rejectMain) => {
    window.postMessage(
      {
        target: requestTarget.SwitchRequestChain,
        icon,
        hostname: location.hostname,
        title: document.title,
        connectChain,
        ID,
      },
      window.location.origin,
    );
    const promise = new Promise((resolve) => {
      const callbackFn = (event) => {
        if (
          event.data.return !== undefined &&
          event.data.return === requestTarget.SwitchRequestChain &&
          event.data.ID === ID
        ) {
          if ((event.data as Object).hasOwnProperty('data')) {
            resolve(true);
          } else {
            resolve(false);
          }
          window.removeEventListener('message', callbackFn);
        }
      };
      window.addEventListener('message', callbackFn);
    });
    promise.then(resolveMain).catch(rejectMain);
  });
}
