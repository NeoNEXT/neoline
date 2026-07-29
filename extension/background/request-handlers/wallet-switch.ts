import { requestTarget, ERRORS } from '../../common/data_module_neo2';
import { requestTargetN3 } from '../../common/data_module_neo3';
import { createWindow, getTrustedHostname, windowCallback } from '../tool';
import { RequestHandlerModule } from './context';

const walletSwitchNetwork: RequestHandlerModule = {
  targets: [
    requestTarget.WalletSwitchNetwork,
    requestTargetN3.WalletSwitchNetwork,
  ],
  handle: ({
    request,
    sender,
    sendResponse,
    chainType,
    currN2Network,
    currN3Network,
    n3Networks,
  }) => {
    const parameter = request.parameter;
    // hostname shown to the user comes from the trusted sender, not the page.
    parameter.hostname = getTrustedHostname(sender);
    const currentChainId =
      chainType === 'Neo2'
        ? currN2Network.chainId
        : chainType === 'Neo3'
        ? currN3Network.chainId
        : -1;
    if (currentChainId === parameter.chainId) {
      windowCallback({
        return: request.target,
        data: null,
        ID: request.ID,
      });
      sendResponse('');
      return;
    }
    const tempNetwork = n3Networks.find((e) => e.chainId === parameter.chainId);
    if (parameter.chainId === 0 && !tempNetwork) {
      // 0 is N3 private network
      windowCallback({
        return: request.target,
        error: ERRORS.MALFORMED_INPUT,
        ID: request.ID,
      });
      sendResponse('');
      return;
    }
    let queryString = '';
    for (const key in parameter) {
      if (parameter.hasOwnProperty(key)) {
        const value = parameter[key];
        queryString += `${key}=${encodeURIComponent(value)}&`;
      }
    }
    createWindow(`wallet-switch-network?${queryString}messageID=${request.ID}`);
    sendResponse('');
    return;
  },
};

const walletSwitchAccount: RequestHandlerModule = {
  targets: [
    requestTarget.WalletSwitchAccount,
    requestTargetN3.WalletSwitchAccount,
  ],
  handle: ({ request, sender, sendResponse }) => {
    const parameter = request.parameter;
    // hostname shown to the user comes from the trusted sender, not the page.
    parameter.hostname = getTrustedHostname(sender);
    let queryString = '';
    for (const key in parameter) {
      if (parameter.hasOwnProperty(key)) {
        const value = parameter[key];
        queryString += `${key}=${encodeURIComponent(value)}&`;
      }
    }
    createWindow(`wallet-switch-account?${queryString}messageID=${request.ID}`);
    sendResponse('');
    return;
  },
};

export default [walletSwitchNetwork, walletSwitchAccount];
