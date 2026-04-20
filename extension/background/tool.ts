import {
  ChainType,
  DEFAULT_N2_RPC_NETWORK,
  DEFAULT_N3_RPC_NETWORK,
  DEFAULT_NEOX_RPC_NETWORK,
  RpcNetwork,
  STORAGE_NAME,
} from '../common/constants';
import {
  getLocalStorage,
  getStorage,
  httpPost,
  notification,
  setLocalStorage,
  setStorage,
} from '../common';
import {
  getScriptHashFromAddress,
  getWalletType,
} from '../common/utils';
import { EVENT } from '../common/data_module_neo2';
import { Wallet3 } from '../common/data_module_neo3';
import { tx as tx3, wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';

/**
 * Background methods support.
 * Call window.NeoLineBackground to use.
 */
declare var chrome;

export async function getChainType() {
  let chainType: ChainType = await getLocalStorage(
    STORAGE_NAME.chainType,
    () => {},
  );

  if (!chainType) {
    chainType = await getWalletType();
  }

  return chainType;
}

export async function getCurrentNeo2Network() {
  const n2Networks: RpcNetwork[] =
    (await getLocalStorage(STORAGE_NAME.n2Networks, () => {})) ||
    DEFAULT_N2_RPC_NETWORK;

  const n2SelectedNetworkIndex: number =
    (await getLocalStorage(STORAGE_NAME.n2SelectedNetworkIndex, () => {})) || 0;

  const currN2Network = n2Networks[n2SelectedNetworkIndex];
  return { currN2Network, n2Networks };
}

export async function getCurrentNeo3Network() {
  const n3Networks: RpcNetwork[] =
    (await getLocalStorage(STORAGE_NAME.n3Networks, () => {})) ||
    DEFAULT_N3_RPC_NETWORK;

  const n3SelectedNetworkIndex: number =
    (await getLocalStorage(STORAGE_NAME.n3SelectedNetworkIndex, () => {})) || 0;

  const currN3Network = n3Networks[n3SelectedNetworkIndex];
  return { currN3Network, n3Networks };
}

export async function getCurrentNeoXNetwork() {
  const neoXNetworks: RpcNetwork[] =
    (await getLocalStorage(STORAGE_NAME.neoXNetworks, () => {})) ||
    DEFAULT_NEOX_RPC_NETWORK;

  const neoXSelectedNetworkIndex: number =
    (await getLocalStorage(STORAGE_NAME.neoXSelectedNetworkIndex, () => {})) ||
    0;

  const currNeoXNetwork = neoXNetworks[neoXSelectedNetworkIndex];
  return { currNeoXNetwork, neoXNetworks };
}

export async function listenBlock(currNetwork: RpcNetwork) {
  const networkId = currNetwork.id;
  const rpcUrl = currNetwork.rpcUrl;
  let oldHeight =
    (await getLocalStorage(`BlockHeight_${networkId}`, () => {})) || 0;
  httpPost(
    rpcUrl,
    {
      jsonrpc: '2.0',
      method: 'getblockcount',
      params: [],
      id: 1,
    },
    async (blockHeightData) => {
      const newHeight = blockHeightData.result;
      if (oldHeight === newHeight) return;
      if (oldHeight === 0 || newHeight - oldHeight > 5) {
        oldHeight = newHeight - 1;
      }
      let timer: NodeJS.Timeout;
      for (let reqHeight = oldHeight; reqHeight < newHeight; reqHeight++) {
        timer = setTimeout(() => {
          httpPost(
            rpcUrl,
            {
              jsonrpc: '2.0',
              method: 'getblock',
              params: [reqHeight, 1],
              id: 1,
            },
            (blockDetail) => {
              if (blockDetail.error === undefined) {
                const txStrArr = [];
                blockDetail.result.tx.forEach((item) => {
                  txStrArr.push(item.txid || item.hash);
                });
                windowCallback({
                  data: {
                    chainId: currNetwork.chainId,
                    blockHeight: reqHeight,
                    blockTime: blockDetail.result.time,
                    blockHash: blockDetail.result.hash,
                    tx: txStrArr,
                  },
                  return: EVENT.BLOCK_HEIGHT_CHANGED,
                });
              }
              if (newHeight - reqHeight <= 1) {
                const setData = {};
                setData[`BlockHeight_${networkId}`] = newHeight;
                setLocalStorage(setData);
                clearTimeout(timer);
              }
            },
            '*',
          );
        });
      }
    },
    '*',
  );
}

export async function waitTxs(currNetwork: RpcNetwork, chainType: ChainType) {
  const networkId = currNetwork.id;
  const txArr =
    (await getLocalStorage(`TxArr_${chainType}-${networkId}`, () => {})) || [];
  if (txArr.length === 0) {
    return;
  }
  let tempTxArr = [...txArr];
  for (const txid of tempTxArr) {
    const data = {
      jsonrpc: '2.0',
      method: 'getrawtransaction',
      params: [txid, chainType === 'Neo2' ? 1 : true],
      id: 1,
    };
    httpPost(currNetwork.rpcUrl, data, (res) => {
      if (res?.result?.blocktime) {
        const explorerUrl = currNetwork.explorer
          ? `${currNetwork.explorer}transaction/${txid}`
          : null;
        const sliceTxid = txid.slice(0, 4) + '...' + txid.slice(-4);
        notification(
          explorerUrl,
          'Confirmed transaction',
          `Transaction ${sliceTxid} confirmed! View on NeoTube`,
        );
        windowCallback({
          data: {
            chainId: currNetwork.chainId,
            txid,
            blockHeight: res?.result?.blockindex,
            blockTime: res?.result?.blocktime,
          },
          return: EVENT.TRANSACTION_CONFIRMED,
        });
        const setData = {};
        tempTxArr = tempTxArr.filter((item) => item !== txid);
        setData[`TxArr_${chainType}-${networkId}`] = tempTxArr;
        setLocalStorage(setData);
      }
    });
  }
}

export function resetData() {
  setLocalStorage({
    password: '',
    [STORAGE_NAME.shouldFindNode]: true,
    [STORAGE_NAME.hasLoginAddress]: {},
    [STORAGE_NAME.InvokeArgsArray]: {},
  });
  setStorage({ [STORAGE_NAME.connectedWebsites]: {} });
}

export function windowCallback(data) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
    // console.log(tabs);
    // tabCurr = tabs;
    if (tabs.length > 0) {
      tabs.forEach((item) => {
        chrome.tabs.sendMessage(item.id, data, () => {
          // tabCurr = null;
        });
      });
    }
  });
}

export function createWindow(url: string, notification = true) {
  const isWindows = navigator.userAgent.includes('Windows');
  chrome.windows.create({
    url: notification ? `index.html#popup/notification/${url}` : url,
    focused: true,
    width: isWindows ? 391 : 375,
    height: isWindows ? 639 : 630,
    left: 0,
    top: 0,
    type: 'popup',
  });
}

/**
 * Returns the first network configuration object that matches at least one field of the
 * provided search criteria. Returns null if no match is found
 *
 * @param {object} rpcInfo - The RPC endpoint properties and values to check.
 * @returns {object} rpcInfo found in the network configurations list
 */
export function findNetworkConfigurationBy(
  rpcInfo: Partial<RpcNetwork>,
  neoXNetworks: RpcNetwork[],
): RpcNetwork | null {
  const networkConfiguration = neoXNetworks.find((configuration) => {
    return Object.keys(rpcInfo).some((key) => {
      return configuration[key] === rpcInfo[key];
    });
  });

  return networkConfiguration || null;
}

function normalizeSignerHash(hash: any) {
  return String(hash || '')
    .replace(/^0x/i, '')
    .toLowerCase();
}

function normalizePublicKey(publicKey?: string) {
  return String(publicKey || '')
    .replace(/^0x/i, '')
    .trim()
    .toLowerCase();
}

function normalizeContextItems<T = any>(items: Record<string, T> = {}) {
  return Object.entries(items || {}).reduce((acc, [hash, item]) => {
    const normalizedHash = normalizeSignerHash(hash);
    if (!normalizedHash || !item) {
      return acc;
    }
    if (!Object.prototype.hasOwnProperty.call(acc, normalizedHash)) {
      acc[normalizedHash] = item;
    }
    return acc;
  }, {} as Record<string, T>);
}

function deserializeSignTransactionPayload(parameter: any) {
  if (parameter?.context?.data) {
    try {
      return tx3.Transaction.deserialize(
        Buffer.from(parameter.context.data, 'base64').toString('hex')
      );
    } catch (_) {
      return new tx3.Transaction(
        JSON.parse(Buffer.from(parameter.context.data, 'base64').toString())
      );
    }
  }

  if (parameter?.transaction) {
    return new tx3.Transaction(parameter.transaction);
  }

  throw new Error('Missing transaction payload');
}

function decodeContextScript(script?: string) {
  if (!script) {
    return '';
  }

  const normalized = String(script).replace(/^0x/i, '');
  if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
    return normalized;
  }

  return Buffer.from(script, 'base64').toString('hex');
}

type SignableContextItem = {
  signerHash: string;
  item: any;
  verificationScript: string;
};

function hasPublicKeyInVerificationScript(
  verificationScript: string,
  publicKey: string,
) {
  try {
    const targetPublicKey = normalizePublicKey(publicKey);
    const publicKeys = wallet3
      .getPublicKeysFromVerificationScript(verificationScript)
      .map((key) => normalizePublicKey(key));
    return !!targetPublicKey && publicKeys.includes(targetPublicKey);
  } catch (_) {
    return false;
  }
}

export function findSignableContextItem(params: {
  items: Record<string, any>;
  accountHash: string;
  publicKey?: string;
}): SignableContextItem | null {
  const normalizedItems = normalizeContextItems(params.items);
  const normalizedAccountHash = normalizeSignerHash(params.accountHash);
  const entries = Object.entries(normalizedItems).filter(
    ([, item]) => !!item,
  );

  for (const [rawSignerHash, item] of entries) {
    const signerHash = rawSignerHash;
    const verificationScript = decodeContextScript(item?.script);
    if (!verificationScript) {
      continue;
    }

    // item.script 存在时，优先按公钥是否属于该验证脚本判断是否可签。
    // If item.script exists, prefer checking whether the current public key belongs to that verification script.
    if (
      params.publicKey &&
      hasPublicKeyInVerificationScript(verificationScript, params.publicKey)
    ) {
      return {
        signerHash,
        item,
        verificationScript,
      };
    }

    // 单签兜底：无公钥信息时，允许 signerHash 命中当前账户 scriptHash。
    // Single-sig fallback: when no public key is available, allow a signerHash match against the current account scriptHash.
    if (signerHash === normalizedAccountHash) {
      try {
        const publicKeys =
          wallet3.getPublicKeysFromVerificationScript(verificationScript);
        if (publicKeys.length === 1) {
          return {
            signerHash,
            item,
            verificationScript,
          };
        }
      } catch (_) {}
    }
  }

  // item.script 为空时按单签账户处理：检查当前 scriptHash 是否在 items keys 中。
  // If item.script is empty, treat it like a single-sig account and check whether the current scriptHash exists in the item keys.
  const noScriptEntry = entries.find(([rawSignerHash, item]) => {
    return (
      !decodeContextScript(item?.script) &&
      rawSignerHash === normalizedAccountHash
    );
  });

  if (!noScriptEntry) {
    return null;
  }

  return {
    signerHash: noScriptEntry[0],
    item: noScriptEntry[1],
    verificationScript: '',
  };
}

function canSignWithContextItems(
  items: Record<string, any>,
  currentHash: string,
  currentPublicKey?: string,
) {
  if (!items || typeof items !== 'object') {
    return false;
  }

  return !!findSignableContextItem({
    items,
    accountHash: currentHash,
    publicKey: currentPublicKey,
  });
}

function getCurrentNeo3PublicKey(currentWallet: Wallet3) {
  const storedPublicKey = currentWallet?.accounts?.[0]?.extra?.publicKey;
  if (storedPublicKey) {
    return storedPublicKey;
  }

  const verificationScript = decodeContextScript(
    currentWallet?.accounts?.[0]?.contract?.script,
  );
  if (!verificationScript) {
    return '';
  }

  try {
    const publicKeys = wallet3.getPublicKeysFromVerificationScript(
      verificationScript,
    );
    if (publicKeys.length !== 1) {
      return '';
    }
    return publicKeys[0];
  } catch (_) {
    return '';
  }
}

export function canCurrentWalletSignTransaction(parameter: any, currentWallet: Wallet3) {
  const currentAddress = currentWallet?.accounts?.[0]?.address;
  if (!currentAddress) {
    return false;
  }

  const currentHash = normalizeSignerHash(getScriptHashFromAddress(currentAddress));
  if (parameter?.context?.items) {
    const currentPublicKey = getCurrentNeo3PublicKey(currentWallet);
    return canSignWithContextItems(
      parameter.context.items,
      currentHash,
      currentPublicKey,
    );
  }

  const transaction = deserializeSignTransactionPayload(parameter);
  return (transaction.signers || []).some(
    (signer) => normalizeSignerHash(signer.account?.toBigEndian?.()) === currentHash
  );
}
