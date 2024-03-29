import { MESSAGE_TYPE } from '../../common/data_module_evm';
import { ethErrors } from 'eth-rpc-errors';
import { omit } from 'lodash';
import {
  isPrefixedFormattedHexString,
  isSafeChainId,
} from '../../common/evm/network-util';
import {
  createWindow,
  findNetworkConfigurationBy,
  getNetworkInfo,
} from '../tool';

const switchEthereumChain = {
  methodNames: [MESSAGE_TYPE.SWITCH_ETHEREUM_CHAIN],
  implementation: switchEthereumChainHandler,
};

export default switchEthereumChain;

async function switchEthereumChainHandler(params, messageID) {
  if (!params?.[0] || typeof params[0] !== 'object') {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Expected single, object parameter. Received:\n${JSON.stringify(
          params
        )}`,
      })
    );
  }

  const { chainId } = params[0];

  const otherKeys = Object.keys(omit(params[0], ['chainId']));

  if (otherKeys.length > 0) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Received unexpected keys on object parameter. Unsupported keys:\n${otherKeys}`,
      })
    );
  }

  const _chainId = typeof chainId === 'string' && chainId.toLowerCase();

  if (!isPrefixedFormattedHexString(_chainId)) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Expected 0x-prefixed, unpadded, non-zero hexadecimal string 'chainId'. Received:\n${chainId}`,
      })
    );
  }

  if (!isSafeChainId(parseInt(_chainId, 16))) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Invalid chain ID "${_chainId}": numerical value greater than max safe value. Received:\n${chainId}`,
      })
    );
  }

  const existingNetwork = await findNetworkConfigurationBy({
    chainId: parseInt(_chainId, 16),
  });

  if (existingNetwork) {
    const { currNeoXNetwork } = await getNetworkInfo();

    const currentChainId = currNeoXNetwork.chainId;

    // we might want to change all this so that it displays the network you are switching from -> to (in a way that is domain - specific)

    if (currentChainId === parseInt(_chainId, 16)) {
      return;
    }

    createWindow(
      `wallet-switch-network?chainType=neoX&chainId=${parseInt(
        _chainId,
        16
      )}&messageID=${messageID}`
    );
    return;
  }

  return Promise.reject(
    ethErrors.provider.custom({
      code: 4902, // To-be-standardized "unrecognized chain ID" error
      message: `Unrecognized chain ID "${chainId}". Try adding the chain using ${MESSAGE_TYPE.ADD_ETHEREUM_CHAIN} first.`,
    })
  );
}
