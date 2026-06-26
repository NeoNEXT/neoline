import { httpPost } from '../../common';
import {
  requestTarget,
  ERRORS,
  GetBlockInputArgs,
  TransactionInputArgs,
  GetStorageArgs,
} from '../../common/data_module_neo2';
import {
  getScriptHashFromAddress,
  hexstring2str,
  str2hexstring,
} from '../../common/utils';
import { windowCallback } from '../tool';
import { RequestHandlerModule } from './context';

const transaction: RequestHandlerModule = {
  targets: [requestTarget.Transaction],
  handle: ({ request, sendResponse, currN2Network }) => {
    try {
      const parameter = request.parameter;
      const data = {
        jsonrpc: '2.0',
        method: 'getrawtransaction',
        params: [parameter.txid, 1],
        id: 1,
      };
      httpPost(currN2Network.rpcUrl, data, (res) => {
        if (res?.result?.blocktime) {
          windowCallback({
            return: requestTarget.Transaction,
            ID: request.ID,
            data: res.result,
            error: null,
          });
        } else if (res?.error) {
          windowCallback({
            return: requestTarget.Transaction,
            data: null,
            ID: request.ID,
            error: { ...ERRORS.RPC_ERROR, description: res?.error },
          });
        }
      });
    } catch (error) {
      windowCallback({
        return: requestTarget.Transaction,
        data: null,
        ID: request.ID,
        error,
      });
    }
    sendResponse('');
    return;
  },
};

const block: RequestHandlerModule = {
  targets: [requestTarget.Block],
  handle: ({ request, sendResponse, currN2Network }) => {
    try {
      const parameter = request.parameter as GetBlockInputArgs;
      const nodeUrl = currN2Network.rpcUrl;
      httpPost(
        nodeUrl,
        {
          jsonrpc: '2.0',
          method: 'getblock',
          params: [parameter.blockHeight, 1],
          id: 1,
        },
        (response) => {
          windowCallback({
            return: requestTarget.Block,
            data: response.error !== undefined ? null : response.result,
            ID: request.ID,
            error:
              response.error === undefined
                ? null
                : { ...ERRORS.RPC_ERROR, description: response?.error },
          });
          sendResponse('');
        },
        null
      );
    } catch (error) {
      windowCallback({
        return: requestTarget.Block,
        data: null,
        ID: request.ID,
        error,
      });
      sendResponse('');
    }
    return;
  },
};

const applicationLog: RequestHandlerModule = {
  targets: [requestTarget.ApplicationLog],
  handle: ({ request, sendResponse, currN2Network }) => {
    try {
      const parameter = request.parameter as TransactionInputArgs;
      const nodeUrl = currN2Network.rpcUrl;
      httpPost(
        nodeUrl,
        {
          jsonrpc: '2.0',
          method: 'getapplicationlog',
          params: [parameter.txid],
          id: 1,
        },
        (response) => {
          windowCallback({
            return: requestTarget.ApplicationLog,
            data: response.error !== undefined ? null : response.result,
            ID: request.ID,
            error:
              response.error === undefined
                ? null
                : { ...ERRORS.RPC_ERROR, description: response?.error },
          });
          sendResponse('');
        },
        null
      );
    } catch (error) {
      windowCallback({
        return: requestTarget.ApplicationLog,
        data: null,
        ID: request.ID,
        error,
      });
      sendResponse('');
    }
    return;
  },
};

const storage: RequestHandlerModule = {
  targets: [requestTarget.Storage],
  handle: ({ request, sendResponse, currN2Network }) => {
    try {
      const parameter = request.parameter as GetStorageArgs;
      const nodeUrl = currN2Network.rpcUrl;
      httpPost(
        nodeUrl,
        {
          jsonrpc: '2.0',
          method: 'getstorage',
          params: [parameter.scriptHash, str2hexstring(parameter.key)],
          id: 1,
        },
        (response) => {
          windowCallback({
            return: requestTarget.Storage,
            data:
              response.error !== undefined
                ? null
                : { result: hexstring2str(response.result) } || null,
            ID: request.ID,
            error:
              response.error === undefined
                ? null
                : { ...ERRORS.RPC_ERROR, description: response?.error },
          });
          sendResponse('');
        },
        null
      );
    } catch (error) {
      windowCallback({
        return: requestTarget.Storage,
        data: null,
        ID: request.ID,
        error,
      });
      sendResponse('');
    }
    return;
  },
};

const invokeRead: RequestHandlerModule = {
  targets: [requestTarget.InvokeRead],
  handle: ({ request, sendResponse, currN2Network }) => {
    const nodeUrl = currN2Network.rpcUrl;
    request.parameter = [
      request.parameter.scriptHash,
      request.parameter.operation,
      request.parameter.args,
    ];
    const args = request.parameter[2];
    args.forEach((item, index) => {
      if (item.type === 'Address') {
        args[index] = {
          type: 'Hash160',
          value: getScriptHashFromAddress(item.value),
        };
      } else if (item.type === 'Boolean') {
        if (typeof item.value === 'string') {
          if ((item.value && item.value.toLowerCase()) === 'true') {
            args[index] = {
              type: 'Boolean',
              value: true,
            };
          } else if (item.value && item.value.toLowerCase() === 'false') {
            args[index] = {
              type: 'Boolean',
              value: false,
            };
          } else {
            windowCallback({
              error: ERRORS.MALFORMED_INPUT,
              return: requestTarget.InvokeRead,
              ID: request.ID,
            });
            // window.close();
          }
        }
      }
    });
    request.parameter[2] = args;
    const returnRes = {
      data: {},
      ID: request.ID,
      return: requestTarget.InvokeRead,
      error: null,
    };
    httpPost(
      nodeUrl,
      {
        jsonrpc: '2.0',
        method: 'invokefunction',
        params: request.parameter,
        id: 1,
      },
      (res) => {
        res.return = requestTarget.InvokeRead;
        if (!res.error) {
          returnRes.data = {
            script: res.result.script,
            state: res.result.state,
            gas_consumed: res.result.gas_consumed,
            stack: res.result.stack,
          };
        } else {
          returnRes.error = { ...ERRORS.RPC_ERROR, description: res?.error };
        }
        windowCallback(returnRes);
        sendResponse('');
      },
      null
    );
    return;
  },
};

const invokeReadMulti: RequestHandlerModule = {
  targets: [requestTarget.InvokeReadMulti],
  handle: ({ request, sendResponse, currN2Network }) => {
    try {
      const nodeUrl = currN2Network.rpcUrl;
      const requestData = request.parameter;
      requestData.invokeReadArgs.forEach((invokeReadItem: any, index) => {
        invokeReadItem.args.forEach((item, itemIndex) => {
          if (item.type === 'Address') {
            invokeReadItem.args[itemIndex] = {
              type: 'Hash160',
              value: getScriptHashFromAddress(item.value),
            };
          } else if (item.type === 'Boolean') {
            if (typeof item.value === 'string') {
              if ((item.value && item.value.toLowerCase()) === 'true') {
                invokeReadItem.args[itemIndex] = {
                  type: 'Boolean',
                  value: true,
                };
              } else if (item.value && item.value.toLowerCase() === 'false') {
                invokeReadItem.args[itemIndex] = {
                  type: 'Boolean',
                  value: false,
                };
              } else {
                windowCallback({
                  error: ERRORS.MALFORMED_INPUT,
                  return: requestTarget.InvokeReadMulti,
                  ID: request.ID,
                });
                // window.close();
              }
            }
          }
        });
        requestData.invokeReadArgs[index] = [
          invokeReadItem.scriptHash,
          invokeReadItem.operation,
          invokeReadItem.args,
        ];
      });
      const returnRes = {
        data: [],
        ID: request.ID,
        return: requestTarget.InvokeReadMulti,
        error: null,
      };
      let requestCount = 0;
      requestData.invokeReadArgs.forEach((item) => {
        httpPost(
          nodeUrl,
          {
            jsonrpc: '2.0',
            method: 'invokefunction',
            params: item,
            id: 1,
          },
          (res) => {
            requestCount++;
            if (!res.error) {
              returnRes.data.push({
                script: res.result.script,
                state: res.result.state,
                gas_consumed: res.result.gas_consumed,
                stack: res.result.stack,
              });
            } else {
              returnRes.error = {
                ...ERRORS.RPC_ERROR,
                description: res?.error,
              };
            }
            if (requestCount === requestData.invokeReadArgs.length) {
              windowCallback(returnRes);
              sendResponse('');
            }
          },
          null
        );
      });
    } catch (error) {
      windowCallback({
        data: [],
        ID: request.ID,
        return: requestTarget.InvokeReadMulti,
        error: { ...ERRORS.RPC_ERROR, description: error?.error || error },
      });
      sendResponse('');
    }
    return;
  },
};

export default [
  transaction,
  block,
  applicationLog,
  storage,
  invokeRead,
  invokeReadMulti,
];
