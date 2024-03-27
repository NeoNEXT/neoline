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
  httpPost,
  notification,
  setLocalStorage,
} from '../common';
import { getWalletType } from '../common/utils';
import { EVENT } from '../common/data_module_neo2';
/**
 * Background methods support.
 * Call window.NeoLineBackground to use.
 */
declare var chrome;

export async function getNetworkInfo() {
  let chainType: ChainType = await getLocalStorage(
    STORAGE_NAME.chainType,
    () => {}
  );

  const n2Networks: RpcNetwork[] =
    (await getLocalStorage(STORAGE_NAME.n2Networks, () => {})) ||
    DEFAULT_N2_RPC_NETWORK;
  const n3Networks: RpcNetwork[] =
    (await getLocalStorage(STORAGE_NAME.n3Networks, () => {})) ||
    DEFAULT_N3_RPC_NETWORK;
  const neoXNetworks: RpcNetwork[] =
    (await getLocalStorage(STORAGE_NAME.neoXNetworks, () => {})) ||
    DEFAULT_NEOX_RPC_NETWORK;

  const n2SelectedNetworkIndex: number =
    (await getLocalStorage(STORAGE_NAME.n2SelectedNetworkIndex, () => {})) || 0;
  const n3SelectedNetworkIndex: number =
    (await getLocalStorage(STORAGE_NAME.n3SelectedNetworkIndex, () => {})) || 0;
  const neoXSelectedNetworkIndex: number =
    (await getLocalStorage(STORAGE_NAME.neoXSelectedNetworkIndex, () => {})) ||
    0;

  const currN2Network = n2Networks[n2SelectedNetworkIndex];
  const currN3Network = n3Networks[n3SelectedNetworkIndex];
  const currNeoXNetwork = neoXNetworks[neoXSelectedNetworkIndex];

  if (!chainType) {
    chainType = await getWalletType();
  }
  let currentRpcUrl: string;
  let currentNetworkId: number;
  if (chainType === ChainType.Neo2) {
    currentNetworkId = n2Networks[n2SelectedNetworkIndex].id;
    currentRpcUrl = n2Networks[n2SelectedNetworkIndex].rpcUrl;
  } else if (chainType === ChainType.Neo3) {
    currentNetworkId = n3Networks[n3SelectedNetworkIndex].id;
    currentRpcUrl = n3Networks[n3SelectedNetworkIndex].rpcUrl;
  } else {
    currentNetworkId = neoXNetworks[neoXSelectedNetworkIndex].id;
    currentRpcUrl = neoXNetworks[neoXSelectedNetworkIndex].rpcUrl;
  }

  return {
    currN2Network,
    currN3Network,
    currNeoXNetwork,
    chainType,
    n3Networks,
    neoXNetworks,
  };
}

export async function listenNeo2Block(currN2Network: RpcNetwork) {
  const networkId = currN2Network.id;
  const rpcUrl = currN2Network.rpcUrl;
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
      if (oldHeight === 0 || newHeight - oldHeight > 5) {
        oldHeight = newHeight - 1;
      }
      let timer;
      for (let reqHeight = oldHeight; reqHeight < newHeight; reqHeight++) {
        if (oldHeight !== newHeight) {
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
                      chainId: currN2Network.chainId,
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
      }
    },
    '*'
  );
}

export async function waitNeo2Txs(currN2Network: RpcNetwork) {
  const networkId = currN2Network.rpcUrl;
  const txArr = (await getLocalStorage(`TxArr_${networkId}`, () => {})) || [];
  if (txArr.length === 0) {
    return;
  }
  let tempTxArr = [...txArr];
  for (const txid of tempTxArr) {
    const data = {
      jsonrpc: '2.0',
      method: 'getrawtransaction',
      params: [txid, 1],
      id: 1,
    };
    httpPost(currN2Network.rpcUrl, data, (res) => {
      if (res?.result?.blocktime) {
        const explorerUrl = currN2Network.explorer
          ? `${currN2Network.explorer}transaction/${txid}`
          : null;
        const sliceTxid = txid.slice(0, 4) + '...' + txid.slice(-4);
        notification(
          explorerUrl,
          'Confirmed transaction',
          `Transaction ${sliceTxid} confirmed! View on NeoTube`
        );
        windowCallback({
          data: {
            chainId: currN2Network.chainId,
            txid,
            blockHeight: res?.result?.blockindex,
            blockTime: res?.result?.blocktime,
          },
          return: EVENT.TRANSACTION_CONFIRMED,
        });
        const setData = {};
        tempTxArr = tempTxArr.filter((item) => item !== txid);
        setData[`TxArr_${networkId}`] = tempTxArr;
        setLocalStorage(setData);
      }
    });
  }
}
export async function waitN3Txs(currN3Network: RpcNetwork) {
  const networkId = currN3Network.rpcUrl;
  const txArr = (await getLocalStorage(`TxArr_${networkId}`, () => {})) || [];
  if (txArr.length === 0) {
    return;
  }
  let tempTxArr = [...txArr];
  for (const txid of tempTxArr) {
    const data = {
      jsonrpc: '2.0',
      method: 'getrawtransaction',
      params: [txid, true],
      id: 1,
    };
    httpPost(currN3Network.rpcUrl, data, (res) => {
      if (res?.result?.blocktime) {
        const explorerUrl = currN3Network.explorer
          ? `${currN3Network.explorer}transaction/${txid}`
          : null;
        const sliceTxid = txid.slice(0, 4) + '...' + txid.slice(-4);
        notification(
          explorerUrl,
          'Confirmed transaction',
          `Transaction ${sliceTxid} confirmed! View on NeoTube`
        );
        windowCallback({
          data: {
            chainId: currN3Network.chainId,
            txid,
            blockHeight: res?.result?.blockindex,
            blockTime: res?.result?.blocktime,
          },
          return: EVENT.TRANSACTION_CONFIRMED,
        });
        const setData = {};
        tempTxArr = tempTxArr.filter((item) => item !== txid);
        setData[`TxArr_${networkId}`] = tempTxArr;
        setLocalStorage(setData);
      }
    });
  }
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
    width: 386,
    height: 620,
    left: 0,
    top: 0,
    type: 'popup',
  });
}
