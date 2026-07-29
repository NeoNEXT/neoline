import { httpPost } from '../../common';
import {
  requestTargetN3,
  N3TransactionArgs,
  N3GetBlockInputArgs,
  N3ApplicationLogArgs,
  N3GetStorageArgs,
  N3RelayArgs,
  N3InvokeReadArgs,
} from '../../common/data_module_neo3';
import { ERRORS } from '../../common/data_module_neo2';
import { getScriptHashFromAddress, str2hexstring } from '../../common/utils';
import { createNeoDapiError } from '../../../cross-runtime/neo-dapi-error';
import { windowCallback } from '../tool';
import { RequestHandlerModule } from './context';

const transaction: RequestHandlerModule = {
  targets: [requestTargetN3.Transaction],
  handle: ({ request, sendResponse, currN3Network }) => {
    try {
      const parameter = request.parameter as N3TransactionArgs;
      const data = {
        jsonrpc: '2.0',
        method: 'getrawtransaction',
        params: [parameter.txid, true],
        id: 1,
      };
      httpPost(currN3Network.rpcUrl, data, (res) => {
        if (res?.result?.blocktime) {
          windowCallback({
            return: requestTargetN3.Transaction,
            ID: request.ID,
            data: res.result,
            error: null,
          });
        } else if (res?.error) {
          windowCallback({
            return: requestTargetN3.Transaction,
            data: null,
            ID: request.ID,
            error: createNeoDapiError(ERRORS.RPC_ERROR, res.error),
          });
        }
        sendResponse('');
      });
    } catch (error) {
      windowCallback({
        return: requestTargetN3.Transaction,
        data: null,
        ID: request.ID,
        error: createNeoDapiError(ERRORS.RPC_ERROR, error),
      });
      sendResponse('');
    }
    return;
  },
};

const blockCount: RequestHandlerModule = {
  targets: [requestTargetN3.BlockCount],
  handle: ({ request, sendResponse }) => {
    try {
      httpPost(
        request.nodeUrl,
        {
          jsonrpc: '2.0',
          method: 'getblockcount',
          params: [],
          id: 1,
        },
        (response) => {
          windowCallback({
            return: requestTargetN3.BlockCount,
            data: response.error !== undefined ? null : response.result,
            ID: request.ID,
            error:
              response.error === undefined
                ? null
                : createNeoDapiError(ERRORS.RPC_ERROR, response.error),
          });
          sendResponse('');
        },
        null
      );
    } catch (error) {
      windowCallback({
        return: requestTargetN3.BlockCount,
        data: null,
        ID: request.ID,
        error: createNeoDapiError(ERRORS.RPC_ERROR, error),
      });
      sendResponse('');
    }
    return;
  },
};

const block: RequestHandlerModule = {
  targets: [requestTargetN3.Block],
  handle: ({ request, sendResponse }) => {
    try {
      const parameter = request.parameter as N3GetBlockInputArgs;
      httpPost(
        request.nodeUrl,
        {
          jsonrpc: '2.0',
          method: 'getblock',
          params: [parameter.blockHeight, 1],
          id: 1,
        },
        (response) => {
          windowCallback({
            return: requestTargetN3.Block,
            data: response.error !== undefined ? null : response.result,
            ID: request.ID,
            error:
              response.error === undefined
                ? null
                : createNeoDapiError(ERRORS.RPC_ERROR, response.error),
          });
          sendResponse('');
        },
        null
      );
    } catch (error) {
      windowCallback({
        return: requestTargetN3.Block,
        data: null,
        ID: request.ID,
        error: createNeoDapiError(ERRORS.RPC_ERROR, error),
      });
      sendResponse('');
    }
    return;
  },
};

const applicationLog: RequestHandlerModule = {
  targets: [requestTargetN3.ApplicationLog],
  handle: ({ request, sendResponse }) => {
    try {
      const parameter = request.parameter as N3ApplicationLogArgs;
      httpPost(
        request.nodeUrl,
        {
          jsonrpc: '2.0',
          method: 'getapplicationlog',
          params: [parameter.txid],
          id: 1,
        },
        (response) => {
          windowCallback({
            return: requestTargetN3.ApplicationLog,
            data: response.error !== undefined ? null : response.result,
            ID: request.ID,
            error:
              response.error === undefined
              ? null
              : createNeoDapiError(ERRORS.RPC_ERROR, response.error),
          });
          sendResponse('');
        },
        null
      );
    } catch (error) {
      windowCallback({
        return: requestTargetN3.ApplicationLog,
        data: null,
        ID: request.ID,
        error: createNeoDapiError(ERRORS.RPC_ERROR, error),
      });
      sendResponse('');
    }
    return;
  },
};

const storage: RequestHandlerModule = {
  targets: [requestTargetN3.Storage],
  handle: ({ request, sendResponse }) => {
    try {
      const parameter = request.parameter as N3GetStorageArgs;
      httpPost(
        request.nodeUrl,
        {
          jsonrpc: '2.0',
          method: 'getstorage',
          params: [
            parameter.scriptHash,
            parameter.keyEncoding === 'base64'
              ? parameter.key
              : str2hexstring(parameter.key),
          ],
          id: 1,
        },
        (response) => {
          windowCallback({
            return: requestTargetN3.Storage,
            data:
              response.error !== undefined
                ? null
                : { result: response.result } || null,
            ID: request.ID,
            error:
              response.error === undefined
                ? null
                : createNeoDapiError(ERRORS.RPC_ERROR, response.error),
          });
          sendResponse('');
        },
        null
      );
    } catch (error) {
      windowCallback({
        return: requestTargetN3.Storage,
        data: null,
        ID: request.ID,
        error: createNeoDapiError(ERRORS.RPC_ERROR, error),
      });
      sendResponse('');
    }
    return;
  },
};

const relay: RequestHandlerModule = {
  targets: [requestTargetN3.Relay],
  handle: ({ request, sendResponse }) => {
    try {
      const parameter = request.parameter as N3RelayArgs;
      httpPost(
        request.nodeUrl,
        {
          jsonrpc: '2.0',
          method: 'sendrawtransaction',
          params: [parameter.data],
          id: 1,
        },
        (response) => {
          windowCallback({
            return: requestTargetN3.Relay,
            data: response.error !== undefined ? null : response.result,
            ID: request.ID,
            error:
              response.error === undefined
                ? null
                : createNeoDapiError(ERRORS.RPC_ERROR, response.error),
          });
          sendResponse('');
        },
        null
      );
    } catch (error) {
      windowCallback({
        return: requestTargetN3.Relay,
        data: null,
        ID: request.ID,
        error: createNeoDapiError(ERRORS.RPC_ERROR, error),
      });
      sendResponse('');
    }
    return;
  },
};

const invokeRead: RequestHandlerModule = {
  targets: [requestTargetN3.InvokeRead],
  handle: ({ request, sendResponse }) => {
    const parameter = request.parameter as N3InvokeReadArgs;
    const signers = parameter.signers.map((item) => {
      return {
        account: item.account,
        scopes: item.scopes,
        allowedcontracts: item.allowedContracts || undefined,
        allowedgroups: item.allowedGroups || undefined,
      };
    });
    request.parameter = [
      parameter.scriptHash,
      parameter.operation,
      parameter.args,
      signers,
    ];
    const args = request.parameter[2];
    let malformedInput = false;
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
            malformedInput = true;
          }
        }
      }
    });
    if (malformedInput) {
      windowCallback({
        error: ERRORS.MALFORMED_INPUT,
        return: requestTargetN3.InvokeRead,
        ID: request.ID,
      });
      sendResponse('');
      return;
    }
    request.parameter[2] = args;
    const returnRes = {
      data: {},
      ID: request.ID,
      return: requestTargetN3.InvokeRead,
      error: null,
    };
    httpPost(
      request.nodeUrl,
      {
        jsonrpc: '2.0',
        method: 'invokefunction',
        params: request.parameter,
        id: 1,
      },
      (res) => {
        res.return = requestTargetN3.InvokeRead;
        if (!res.error) {
          returnRes.data = res.result;
        } else {
          returnRes.error = createNeoDapiError(ERRORS.RPC_ERROR, res.error);
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
  targets: [requestTargetN3.InvokeReadMulti],
  handle: ({ request, sendResponse, currN3Network }) => {
    try {
      const requestData = request.parameter;
      const nodeUrl = currN3Network.rpcUrl;
      const signers = requestData.signers.map((item) => {
        return {
          account: item.account,
          scopes: item.scopes,
          allowedcontracts: item.allowedContracts || undefined,
          allowedgroups: item.allowedGroups || undefined,
        };
      });
      let malformedInput = false;
      requestData.invokeReadArgs.forEach((invokeReadItem: any, index) => {
        invokeReadItem.args.forEach((item, itemIndex) => {
          if (item === null || typeof item !== 'object') {
            return;
          } else if (item.type === 'Address') {
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
                malformedInput = true;
              }
            }
          }
        });
        requestData.invokeReadArgs[index] = [
          invokeReadItem.scriptHash,
          invokeReadItem.operation,
          invokeReadItem.args,
          signers,
        ];
      });
      if (malformedInput) {
        windowCallback({
          error: ERRORS.MALFORMED_INPUT,
          return: requestTargetN3.InvokeReadMulti,
          ID: request.ID,
        });
        sendResponse('');
        return;
      }
      const returnRes = {
        data: [],
        ID: request.ID,
        return: requestTargetN3.InvokeReadMulti,
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
              returnRes.data.push(res.result);
            } else {
              returnRes.data.push(res.error);
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
        return: requestTargetN3.InvokeReadMulti,
        error: createNeoDapiError(ERRORS.RPC_ERROR, error),
      });
      sendResponse('');
    }
    return;
  },
};

export default [
  transaction,
  blockCount,
  block,
  applicationLog,
  storage,
  relay,
  invokeRead,
  invokeReadMulti,
];
