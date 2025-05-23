import {
  ChainType,
  ConnectedWebsitesType,
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
import { getWalletType } from '../common/utils';
import { EVENT } from '../common/data_module_neo2';
/**
 * Background methods support.
 * Call window.NeoLineBackground to use.
 */
declare var chrome;

export async function getChainType() {
  let chainType: ChainType = await getLocalStorage(
    STORAGE_NAME.chainType,
    () => {}
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
            '*'
          );
        });
      }
    },
    '*'
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
          `Transaction ${sliceTxid} confirmed! View on NeoTube`
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
  getStorage(STORAGE_NAME.connectedWebsites, (res: ConnectedWebsitesType) => {
    res = res || {};
    Object.keys(res).forEach((hostname) => {
      Object.keys(res[hostname]?.connectedAddress || {}).forEach((address) => {
        if (res[hostname].connectedAddress[address].keep === false) {
          delete res[hostname].connectedAddress[address];
        }
      });
    });
    setStorage({ [STORAGE_NAME.connectedWebsites]: res });
  });
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
  chrome.windows.create({
    url: notification ? `index.html#popup/notification/${url}` : url,
    focused: true,
    width: 375,
    height: 630,
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
  neoXNetworks: RpcNetwork[]
): RpcNetwork | null {
  const networkConfiguration = neoXNetworks.find((configuration) => {
    return Object.keys(rpcInfo).some((key) => {
      return configuration[key] === rpcInfo[key];
    });
  });

  return networkConfiguration || null;
}
