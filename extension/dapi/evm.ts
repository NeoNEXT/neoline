import EventEmitter = require('events');
import { MESSAGE_TYPE, requestTargetEVM } from '../common/data_module_evm';
import { ERRORS, EVENT } from '../common/data_module_neo2';
import { checkConnectAndLogin, getIcon, sendMessage } from './common';
import { ethErrors } from 'eth-rpc-errors';

enum EventName {
  accountsChanged = 'accountsChanged',
  chainChanged = 'chainChanged',
  connect = 'connect',
  disconnect = 'disconnect',
}

class NEOLineEVMController extends EventEmitter {
  isNEOLine = true;
  constructor() {
    super();
    this.setMaxListeners(100);
  }
  /**
   * Submits an RPC request for the given method, with the given params.
   * Resolves with the result of the method call, or rejects on error.
   *
   * @param args - The RPC request arguments.
   * @param args.method - The RPC method name.
   * @param args.params - The parameters for the RPC method.
   * @returns A Promise that resolves with the result of the RPC method,
   * or rejects if an error is encountered.
   */
  async request(args: {
    method: string;
    params?: Array<unknown>;
  }): Promise<any> {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw ethErrors.rpc.invalidRequest({
        message: 'Expected a single, non-array, object argument.',
        data: args,
      });
    }

    const { method, params } = args;

    if (typeof method !== 'string' || method.length === 0) {
      throw ethErrors.rpc.invalidRequest({
        message: "'args.method' must be a non-empty string.",
        data: args,
      });
    }

    if (
      params !== undefined &&
      !Array.isArray(params) &&
      (typeof params !== 'object' || params === null)
    ) {
      throw ethErrors.rpc.invalidRequest({
        message: "'args.params' must be an object or array if provided.",
        data: args,
      });
    }

    if (method === MESSAGE_TYPE.ETH_REQUEST_ACCOUNTS) {
      const isAuth = await checkConnectAndLogin();
      if (isAuth === true) {
        return sendMessage(requestTargetEVM.request, args);
      }
      throw ethErrors.provider.userRejectedRequest().serialize();
    }

    (args as any).hostInfo = {
      hostname: location.hostname,
      icon: getIcon(),
      origin: location.origin,
    };

    return sendMessage(requestTargetEVM.request, args);
  }
}

const provider = new Proxy(new NEOLineEVMController(), {
  get: (e, t) => e[t],
  deleteProperty: () => !0,
});

window.addEventListener('message', (e) => {
  const response = e.data;
  if (response.return === EVENT.ACCOUNT_CHANGED) {
    provider.emit(EventName.accountsChanged, response.data);
  }
  if (response.return === EVENT.NETWORK_CHANGED) {
    provider.emit(EventName.chainChanged, response.data?.chainId);
  }
});

Reflect.set(window, 'ethereum', provider);

function announceProvider() {
  const info: EIP6963ProviderInfo = {
    uuid: 'bb14cf73-2959-456f-a26e-f5d87e08013e',
    name: 'NEOLine',
    icon: 'data:image/svg+xml;charset=utf-8;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiBmaWxsPSJub25lIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgdmlld0JveD0iMCAwIDYwIDYwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgeDE9IjAuMzAxMDc0MTc3MDI2NzQ4NjYiIHkxPSIxLjA0NjU4NDI0ODU0Mjc4NTYiIHgyPSIwLjY5ODkyNTY3Mzk2MTYzOTQiIHkyPSItMC4wNDY1NDUyNDEwMjgwNzA0NSIgaWQ9Im1hc3Rlcl9zdmcwXzEzN18wMDkyNSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzhERDlEMiIgc3RvcC1vcGFjaXR5PSIxIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDZDQ0FCIiBzdG9wLW9wYWNpdHk9IjEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Zz48Zz48cGF0aCBkPSJNNjAsMTIuNjI5OUw2MCw0Ny4zNzAxQzYwLjAwMjQsNDkuMzIyMSw1OS41NTA1LDUxLjI0NzksNTguNjc5OSw1Mi45OTUxQzU4LjY0MTgsNTMuMDcyNCw1OC42MDE5LDUzLjE0OTIsNTguNTYyNyw1My4yMjUzQzU2LjM4NDgsNTcuMzg4MSw1Mi4wNzMxLDU5Ljk5Nyw0Ny4zNzEzLDU5Ljk5N0wxMi42Mjk5LDU5Ljk5N0M1LjY1Mzk5LDYwLjAwMTIsLTAuMDAyNTkwMTgsNTQuMzQ1OSwwLDQ3LjM3MDFMMCwxMi42Mjk5QzAsNS42NTQyOSw1LjY1NDMsMCwxMi42Mjk5LDBMNDcuMzcwMSwwQzU0LjM0NTcsMCw2MCw1LjY1NDI5LDYwLDEyLjYyOTlaIiBmaWxsPSJ1cmwoI21hc3Rlcl9zdmcwXzEzN18wMDkyNSkiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48Zz48cGF0aCBkPSIiIGZpbGw9IiMwMDAwMDAiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48Zz48cGF0aCBkPSIiIGZpbGw9IiMwMDAwMDAiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48Zz48Zz48cGF0aCBkPSJNMTEuOTQwMjIyNzQwMTczMzQsMTYuODk2NjIwMzU2MTQwMTM2TDExLjk0MDIyMjc0MDE3MzM0LDQzLjUyOTIxMDM1NjE0MDEzTDI5LjI1MTEyMjc0MDE3MzM0LDQ5Ljg1NDQxMDM1NjE0MDEzNkwyOS4yNTExMjI3NDAxNzMzNCwyMi44ODkwMTAzNTYxNDAxMzdMNDguMDU5NzIyNzQwMTczMzQsMTUuODk4MTkwMzU2MTQwMTM3TDMwLjkxNTIyMjc0MDE3MzM0LDkuOTA1ODEwMzU2MTQwMTM3TDExLjk0MDIyMjc0MDE3MzM0LDE2Ljg5NjYyMDM1NjE0MDEzNloiIGZpbGw9IiNGRkZGRkYiIGZpbGwtb3BhY2l0eT0iMC4yMDAwMDAwMDI5ODAyMzIyNCIvPjwvZz48Zz48cGF0aCBkPSJNMzAuNTgyNDM4NDY4OTMzMTA1LDIzLjg4NzQ0NzMzNDEzNjk2NUwzMC41ODI0Mzg0Njg5MzMxMDUsMzguMjAyNDU3MzM0MTM2OTY2TDQ4LjA1OTczODQ2ODkzMzEwNSw0NC41Mjc2NTczMzQxMzY5Nkw0OC4wNTk3Mzg0Njg5MzMxMDUsMTcuMzk1ODU3MzM0MTM2OTYzTDMwLjU4MjQzODQ2ODkzMzEwNSwyMy44ODc0NDczMzQxMzY5NjVaIiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9IjAuMjAwMDAwMDAyOTgwMjMyMjQiLz48L2c+PC9nPjxnPjxwYXRoIGQ9Ik0zOC4yMDMwNTg5MTcyMzYzMjYsMzguODkwMzM3MDc4ODU3NDJDMzcuNDgyMDU4OTE3MjM2MzMsMzguODkwMzM3MDc4ODU3NDIsMzYuODk3NTU4OTE3MjM2MzI0LDM4LjMwNTgzNzA3ODg1NzQyLDM2Ljg5NzU1ODkxNzIzNjMyNCwzNy41ODQ4MzcwNzg4NTc0MkwzNi44OTc1NTg5MTcyMzYzMjQsMzAuNjYyNjA3MDc4ODU3NDIzQzM2Ljg5NjA1ODkxNzIzNjMzLDI4LjQ5MjI4NzA3ODg1NzQyMywzNS4xMzYyNTg5MTcyMzYzMjYsMjYuNzMzNjg3MDc4ODU3NDIsMzIuOTY1OTM4OTE3MjM2MzMsMjYuNzMzNjg3MDc4ODU3NDJDMzAuNzk1NjA4OTE3MjM2MzMsMjYuNzMzNjg3MDc4ODU3NDIsMjkuMDM1Nzg4OTE3MjM2MzI4LDI4LjQ5MjI4NzA3ODg1NzQyMywyOS4wMzQyOTg5MTcyMzYzMjcsMzAuNjYyNjA3MDc4ODU3NDIzTDI5LjAzNDI5ODkxNzIzNjMyNywzNy41ODQ4MzcwNzg4NTc0MkMyOS4wMzQyOTg5MTcyMzYzMjcsMzguMzA1ODM3MDc4ODU3NDIsMjguNDQ5ODE4OTE3MjM2MzMsMzguODkwMzM3MDc4ODU3NDIsMjcuNzI4ODI4OTE3MjM2MzI4LDM4Ljg5MDMzNzA3ODg1NzQyQzI3LjAwNzgzNjkxNzIzNjMzLDM4Ljg5MDMzNzA3ODg1NzQyLDI2LjQyMzM1ODkxNzIzNjMyOCwzOC4zMDU4MzcwNzg4NTc0MiwyNi40MjMzNTg5MTcyMzYzMjgsMzcuNTg0ODM3MDc4ODU3NDJMMjYuNDIzMzU4OTE3MjM2MzI4LDMwLjY2MjYwNzA3ODg1NzQyM0MyNi40MjMzNTcxMjkwOTYzMjgsMjcuMDQ5MjQ3MDc4ODU3NDIzLDI5LjM1MjU2ODkxNzIzNjMzLDI0LjEyMDAzNzA3ODg1NzQyMiwzMi45NjU5Mzg5MTcyMzYzMywyNC4xMjAwMzcwNzg4NTc0MjJDMzYuNTc5MjU4OTE3MjM2MzMsMjQuMTIwMDM3MDc4ODU3NDIyLDM5LjUwODU1ODkxNzIzNjMzLDI3LjA0OTI0NzA3ODg1NzQyMywzOS41MDg1NTg5MTcyMzYzMywzMC42NjI2MDcwNzg4NTc0MjNMMzkuNTA4NTU4OTE3MjM2MzMsMzcuNTg0ODM3MDc4ODU3NDJDMzkuNTA4NTU4OTE3MjM2MzMsMzguMzA1ODM3MDc4ODU3NDIsMzguOTI0MDU4OTE3MjM2MzMsMzguODkwMzM3MDc4ODU3NDIsMzguMjAzMDU4OTE3MjM2MzI2LDM4Ljg5MDMzNzA3ODg1NzQyWiIgZmlsbD0iI0ZGRkZGRiIgZmlsbC1vcGFjaXR5PSIxIi8+PC9nPjxnPjxwYXRoIGQ9Ik01Ni4xNTk5MTE0NDQwOTE4LDMxLjUwNTE5MTMzOTExMTMyN0M1Ni4xNTk0MTE0NDQwOTE3OTUsMjYuNTYzNzYxMzM5MTExMzI3LDUxLjQ3MTgxMTQ0NDA5MTgsMjIuOTY3NjExMzM5MTExMzMsNDYuNjk4OTAxNDQ0MDkxNzk2LDI0LjI0Njk4MTMzOTExMTMzQzQxLjkyNTk1MTQ0NDA5MTc5NCwyNS41MjYzNjEzMzkxMTEzMywzOS42NjU1MDE0NDQwOTE3OTUsMzAuOTg0ODkxMzM5MTExMzMsNDIuMTM2NTcxNDQ0MDkxOCwzNS4yNjQwOTEzMzkxMTEzM0M0NC42MDc2NDE0NDQwOTE4LDM5LjU0MzI5MTMzOTExMTMzLDUwLjQ2NTIyMTQ0NDA5MTc5Niw0MC4zMTM5OTEzMzkxMTEzMjUsNTMuOTU5MTExNDQ0MDkxNzk2LDM2LjgxOTU5MTMzOTExMTMzQzU0LjQ1NTUxMTQ0NDA5MTgsMzYuMzA3NTkxMzM5MTExMzI2LDU0LjQ0OTIxMTQ0NDA5MTc5NCwzNS40OTE4OTEzMzkxMTEzMjYsNTMuOTQ0ODExNDQ0MDkxOCwzNC45ODc2OTEzMzkxMTEzM0M1My40NDA0MTE0NDQwOTE3OTQsMzQuNDgzMzkxMzM5MTExMzMsNTIuNjI0NzExNDQ0MDkxOCwzNC40NzcyOTEzMzkxMTEzMyw1Mi4xMTI4MTE0NDQwOTE4LDM0Ljk3Mzg5MTMzOTExMTMyNkM0OS45NDIzMTE0NDQwOTE4LDM3LjE0MjY5MTMzOTExMTMzLDQ2LjMzNTY5MTQ0NDA5MTc5LDM2LjgwNzU5MTMzOTExMTMyNiw0NC42MDE5MDE0NDQwOTE3OTQsMzQuMjc2MDkxMzM5MTExMzNDNDIuODY4MTExNDQ0MDkxNzk1LDMxLjc0NDYwMTMzOTExMTMyNyw0My44NTkwOTE0NDQwOTE3OTYsMjguMjYwNjQxMzM5MTExMzI3LDQ2LjY2NTYzMTQ0NDA5MTc5NCwyNy4wMjA2MjEzMzkxMTEzM0M0OS40NzIxODE0NDQwOTE3OTUsMjUuNzgwNTkxMzM5MTExMzMsNTIuNzE1MjExNDQ0MDkxNzksMjcuMzkzODExMzM5MTExMzI3LDUzLjQxOTQxMTQ0NDA5MTc5LDMwLjM4MDE5MTMzOTExMTMyN0w1MC4zNzI1NzE0NDQwOTE4LDMwLjM4MDE5MTMzOTExMTMyN0M0OS42NzYxNDE0NDQwOTE4LDMwLjM2NTA3MTMzOTExMTMyOCw0OS4xMDM0MzE0NDQwOTE4LDMwLjkyNTQ5MTMzOTExMTMzLDQ5LjEwMzQzMTQ0NDA5MTgsMzEuNjIyMDgxMzM5MTExMzNDNDkuMTAzNDMxNDQ0MDkxOCwzMi4zMTg2ODEzMzkxMTEzMyw0OS42NzYxNDE0NDQwOTE4LDMyLjg3OTEwMTMzOTExMTMzLDUwLjM3MjU3MTQ0NDA5MTgsMzIuODYzOTgxMzM5MTExMzNMNTQuODM4MDExNDQ0MDkxOCwzMi44NjM5ODEzMzkxMTEzM0M1NS4yMTMxMTE0NDQwOTE3OTQsMzIuODYzOTIxMzM5MTExMzMsNTUuNTY4MTExNDQ0MDkxOCwzMi42OTQxOTEzMzkxMTEzMyw1NS44MDM2MTE0NDQwOTE4LDMyLjQwMjI2MTMzOTExMTMzQzU2LjAzMzExMTQ0NDA5MTc5NCwzMi4xNjAwNjEzMzkxMTEzMyw1Ni4xNjA3MTE0NDQwOTE3OTUsMzEuODM4ODYxMzM5MTExMzMsNTYuMTU5OTExNDQ0MDkxOCwzMS41MDUxOTEzMzkxMTEzMjdaIiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9IjEiLz48L2c+PGc+PHBhdGggZD0iTTE4LjU2NjQ1OTIzNzY3MDg5OCwzOC44OTk3MDI0MDE3MzM0TDEyLjQ4MzI1OTIzNzY3MDg5OCwzOC44OTk3MDI0MDE3MzM0QzkuMjM1MzE5MjM3NjcwODk5LDM4Ljg5NTkwMjQwMTczMzM5NSw2LjYwMzQxMDAzNzY3MDg5OSwzNi4yNjM3MDI0MDE3MzM0LDYuNTk5ODU5MjM3NjcwODk4LDMzLjAxNTgwMjQwMTczMzM5Nkw2LjU5OTg1OTIzNzY3MDg5OCwxNi43ODk0MjI0MDE3MzMzOTdDNi42MTQ5MDI4Mzc2NzA4OTksMTYuMDc5MzYyNDAxNzMzNCw3LjE5NDgyMTIzNzY3MDg5OCwxNS41MTE2MDI0MDE3MzMzOTgsNy45MDUwMzkyMzc2NzA4OTg0LDE1LjUxMTYwMjQwMTczMzM5OEM4LjYxNTI0OTIzNzY3MDg5OCwxNS41MTE2MDI0MDE3MzMzOTgsOS4xOTUxNjkyMzc2NzA4OTgsMTYuMDc5MzYyNDAxNzMzNCw5LjIxMDIwOTIzNzY3MDg5OSwxNi43ODk0MjI0MDE3MzMzOTdMOS4yMTAyMDkyMzc2NzA4OTksMzMuMDE1ODAyNDAxNzMzMzk2QzkuMjEyMTQ5MjM3NjcwODk4LDM0LjgyMjYwMjQwMTczMzQsMTAuNjc2NDA5MjM3NjcwOSwzNi4yODY5MDI0MDE3MzM0LDEyLjQ4MzI1OTIzNzY3MDg5OCwzNi4yODg4MDI0MDE3MzM0TDE4LjU2NjQ1OTIzNzY3MDg5OCwzNi4yODg4MDI0MDE3MzM0QzIwLjM3MzI1OTIzNzY3MDksMzYuMjg2OTAyNDAxNzMzNCwyMS44Mzc1NTkyMzc2NzA5LDM0LjgyMjYwMjQwMTczMzQsMjEuODM5NDU5MjM3NjcwODk4LDMzLjAxNTgwMjQwMTczMzM5NkwyMS44Mzk0NTkyMzc2NzA4OTgsMjUuNDY0MjEyNDAxNzMzNEMyMS44Mzk0NTkyMzc2NzA4OTgsMjQuNzQzMjIyNDAxNzMzMzk4LDIyLjQyMzk1OTIzNzY3MDksMjQuMTU4NzQyNDAxNzMzNCwyMy4xNDQ5NTkyMzc2NzA5LDI0LjE1ODc0MjQwMTczMzRDMjMuODY1OTU5MjM3NjcwOSwyNC4xNTg3NDI0MDE3MzM0LDI0LjQ1MDQ1OTIzNzY3MDksMjQuNzQzMjIyNDAxNzMzMzk4LDI0LjQ1MDQ1OTIzNzY3MDksMjUuNDY0MjEyNDAxNzMzNEwyNC40NTA0NTkyMzc2NzA5LDMzLjAxNTgwMjQwMTczMzM5NkMyNC40NDY1NTkyMzc2NzA4OTcsMzYuMjYzODAyNDAxNzMzNCwyMS44MTQ0NTkyMzc2NzA5LDM4Ljg5NTkwMjQwMTczMzM5NSwxOC41NjY0NTkyMzc2NzA4OTgsMzguODk5NzAyNDAxNzMzNFoiIGZpbGw9IiNGRkZGRkYiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48ZyB0cmFuc2Zvcm09Im1hdHJpeCgwLjcwNzEwNjc2OTA4NDkzMDQsMC43MDcxMDY3NjkwODQ5MzA0LC0wLjcwNzEwNjc2OTA4NDkzMDQsMC43MDcxMDY3NjkwODQ5MzA0LDE5LjE4NTk1ODY5ODAwOTAxNywtMTEuMjUzNjM2MjAwNjQ2OTUyKSI+PHJlY3QgeD0iMjMuMTc3MzIwNDgwMzQ2NjgiIHk9IjE3LjUzMjY4MjQxODgyMzI0MiIgd2lkdGg9IjMuOTE1ODE4MjE0NDE2NTA0IiBoZWlnaHQ9IjMuOTE1ODE4MjE0NDE2NTA0IiByeD0iMS45NTc5MDkxMDcyMDgyNTIiIGZpbGw9IiNGRkZGRkYiIGZpbGwtb3BhY2l0eT0iMSIvPjwvZz48Zz48cGF0aCBkPSJNNTguNjc5NzU1MTQ5NDU5ODQsNTEuOTYwMzQ3OTg3MDYwNTQ0TDU4LjY3OTc1NTE0OTQ1OTg0LDUyLjk5ODA0Nzk4NzA2MDU0NUM1OC42NDE2NTUxNDk0NTk4NCw1My4wNzUzODc5ODcwNjA1NDUsNTguNjAxODU1MTQ5NDU5ODQsNTMuMTUyMTQ3OTg3MDYwNTQ1LDU4LjU2MjU1NTE0OTQ1OTg0LDUzLjIyODMxNzk4NzA2MDU1QzU2LjM4NDY1NTE0OTQ1OTg0LDU3LjM5MTA2Nzk4NzA2MDU0NSw1Mi4wNzI5NTUxNDk0NTk4NCw1OS45OTk5Njc5ODcwNjA1NCw0Ny4zNzExNTUxNDk0NTk4NCw1OS45OTk5Njc5ODcwNjA1NEwxMi42Mjk3NTUxNDk0NTk4NCw1OS45OTk5Njc5ODcwNjA1NEM4LjY0NzA0NTE0OTQ1OTgzOSw2MC4wMDMwNjc5ODcwNjA1NSw0Ljg5Njg3NTE0OTQ1OTgzOSw1OC4xMjQ3Njc5ODcwNjA1NSwyLjUxNDE1NTE0OTQ1OTgzOSw1NC45MzMzOTc5ODcwNjA1NDVDMy4xMTU5MTMxNDk0NTk4MzksNTMuNDc2NzU3OTg3MDYwNTQ1LDQuMjc5NTg1MTQ5NDU5ODM5LDUyLjM1NTI3Nzk4NzA2MDU0Niw1Ljk0NTQwNTE0OTQ1OTgzOSw1MS43NjkzMzc5ODcwNjA1NDVDNi41Njc5NzUxNDk0NTk4MzksNTEuNTU0OTg3OTg3MDYwNTUsNy4yMTQzMzUxNDk0NTk4Mzg0LDUxLjQxNzI1Nzk4NzA2MDU0NSw3Ljg3MDIwNTE0OTQ1OTgzOSw1MS4zNTkxODc5ODcwNjA1NDRMNTEuODI4NDU1MTQ5NDU5ODQsNDUuOTUyNzQyNzg3MDYwNTQ0QzU0LjE0OTg1NTE0OTQ1OTg0LDQ1LjY2NTA0ODk4NzA2MDU0NCw1Ni40NTczNTUxNDk0NTk4MzYsNDYuNzA1MDg2OTg3MDYwNTUsNTcuNzE4MjU1MTQ5NDU5ODM2LDQ4LjY3MzgzNzk4NzA2MDU0NEM1OC4zNDczNTUxNDk0NTk4NCw0OS42NTQ0Mzc5ODcwNjA1NSw1OC42ODExNTUxNDk0NTk4NCw1MC43OTUyOTc5ODcwNjA1NSw1OC42Nzk3NTUxNDk0NTk4NCw1MS45NjAzNDc5ODcwNjA1NDRaIiBmaWxsPSIjRkZGRkZGIiBmaWxsLW9wYWNpdHk9IjEiLz48L2c+PGc+PHBhdGggZD0iTTU4LjU2Mjc5MzEwMzQwODgxNSw1My4yMjgyNTE4NTA1ODU5MzRDNTYuMzg0MTkzMTAzNDA4ODEsNTcuMzkxMDcxODUwNTg1OTQsNTIuMDcyNTkzMTAzNDA4ODEsNTkuOTk5OTMxODUwNTg1OTQsNDcuMzcxMzkzMTAzNDA4ODEsNTkuOTk5OTMxODUwNTg1OTRMMTIuNjI5OTkzMTAzNDA4ODEzLDU5Ljk5OTkzMTg1MDU4NTk0QzguMDgwMzQzMTAzNDA4ODEzLDU5Ljk5NTUzMTg1MDU4NTkzNCwzLjg4MzE3MzEwMzQwODgxMzMsNTcuNTQ5NTMxODUwNTg1OTM2LDEuNjM2NTkzMTAzNDA4ODEzNSw1My41OTMyOTE4NTA1ODU5MzVDMi40MTg2NjcxMDM0MDg4MTM2LDUyLjQ1MTcxNzg1MDU4NTkzNiwzLjcxMzYxMzEwMzQwODgxMzYsNTEuNzY5Mjc5MDAzMTM1OTM1LDUuMDk3NzIzMTAzNDA4ODEzLDUxLjc2OTI3NTQyNjg1NTkzNEw1NS4zNzk5OTMxMDM0MDg4MTUsNTEuNzY5Mjc1NDI2ODU1OTM0QzU2LjYwMjk5MzEwMzQwODgxNCw1MS43Njc4NjI4MDA1ODU5NCw1Ny43NjU1OTMxMDM0MDg4MSw1Mi4zMDA3ODg4NTA1ODU5NCw1OC41NjI3OTMxMDM0MDg4MTUsNTMuMjI4MjUxODUwNTg1OTM0WiIgZmlsbD0iI0NFRjVFRCIgZmlsbC1vcGFjaXR5PSIxIi8+PC9nPjwvZz48L3N2Zz4=',
    rdns: 'io.neoline',
  };
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info, provider }),
    })
  );
}

window.addEventListener(
  'eip6963:requestProvider',
  (event: EIP6963RequestProviderEvent) => {
    announceProvider();
  }
);

announceProvider();

/**
 * Represents the assets needed to display a wallet
 */
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

// Request Event dispatched by a DApp
interface EIP6963RequestProviderEvent extends Event {
  type: 'eip6963:requestProvider';
}
