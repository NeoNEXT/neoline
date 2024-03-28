import {
  MESSAGE_TYPE,
  UNKNOWN_TICKER_SYMBOL,
} from '../../common/data_module_evm';
import { getValidUrl } from '../../common/evm/evm-util';
import { ethErrors } from 'eth-rpc-errors';
import { omit } from 'lodash';
import {
  isPrefixedFormattedHexString,
  isSafeChainId,
} from '../../common/evm/network-util';
import { createWindow, getNetworkInfo } from '../common';
import { RpcNetwork, NetworkType } from '../../common/constants';

const addEthereumChain = {
  methodNames: [MESSAGE_TYPE.ADD_ETHEREUM_CHAIN],
  implementation: addEthereumChainHandler,
};
export default addEthereumChain;

async function addEthereumChainHandler(params: any[], messageID: number) {
  if (!params?.[0] || typeof params[0] !== 'object') {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Expected single, object parameter. Received:\n${JSON.stringify(
          params
        )}`,
      })
    );
  }

  const {
    chainId,
    chainName = null,
    blockExplorerUrls = null,
    nativeCurrency = null,
    rpcUrls,
  } = params[0];

  const otherKeys = Object.keys(
    omit(params[0], [
      'chainId',
      'chainName',
      'blockExplorerUrls',
      'iconUrls',
      'rpcUrls',
      'nativeCurrency',
    ])
  );

  if (otherKeys.length > 0) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Received unexpected keys on object parameter. Unsupported keys:\n${otherKeys}`,
      })
    );
  }

  function isLocalhostOrHttps(urlString) {
    const url = getValidUrl(urlString);

    return (
      url !== null &&
      (url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.protocol === 'https:')
    );
  }

  const firstValidRPCUrl = Array.isArray(rpcUrls)
    ? rpcUrls.find((rpcUrl) => isLocalhostOrHttps(rpcUrl))
    : null;

  const firstValidBlockExplorerUrl =
    blockExplorerUrls !== null && Array.isArray(blockExplorerUrls)
      ? blockExplorerUrls.find((blockExplorerUrl) =>
          isLocalhostOrHttps(blockExplorerUrl)
        )
      : null;

  if (!firstValidRPCUrl) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Expected an array with at least one valid string HTTPS url 'rpcUrls', Received:\n${rpcUrls}`,
      })
    );
  }

  if (blockExplorerUrls !== null && !firstValidBlockExplorerUrl) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Expected null or array with at least one valid string HTTPS URL 'blockExplorerUrl'. Received: ${blockExplorerUrls}`,
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

  // if the request is to add a network that is already added and configured
  // with the same RPC gateway we shouldn't try to add it again.
  if (existingNetwork && existingNetwork.rpcUrl === firstValidRPCUrl) {
    // If the network already exists, the request is considered successful
    // res.result = null;

    const { currNeoXNetwork } = await getNetworkInfo();

    const currentChainId = currNeoXNetwork.chainId;
    const currentRpcUrl = currNeoXNetwork.rpcUrl;

    // If the current chainId and rpcUrl matches that of the incoming request
    // We don't need to proceed further.
    if (
      currentChainId === parseInt(_chainId, 16) &&
      currentRpcUrl === firstValidRPCUrl
    ) {
      return Promise.reject();
    }

    // If this network is already added with but is not the currently selected network
    // Ask the user to switch the network
    createWindow(
      `wallet-switch-network?chainType=neoX&chainId=${parseInt(_chainId, 16)}`
    );
    return;
  }

  if (typeof chainName !== 'string' || !chainName) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Expected non-empty string 'chainName'. Received:\n${chainName}`,
      })
    );
  }
  const _chainName =
    chainName.length > 100 ? chainName.substring(0, 100) : chainName;

  if (nativeCurrency !== null) {
    if (typeof nativeCurrency !== 'object' || Array.isArray(nativeCurrency)) {
      return Promise.reject(
        ethErrors.rpc.invalidParams({
          message: `Expected null or object 'nativeCurrency'. Received:\n${nativeCurrency}`,
        })
      );
    }
    if (nativeCurrency.decimals !== 18) {
      return Promise.reject(
        ethErrors.rpc.invalidParams({
          message: `Expected the number 18 for 'nativeCurrency.decimals' when 'nativeCurrency' is provided. Received: ${nativeCurrency.decimals}`,
        })
      );
    }

    if (!nativeCurrency.symbol || typeof nativeCurrency.symbol !== 'string') {
      return Promise.reject(
        ethErrors.rpc.invalidParams({
          message: `Expected a string 'nativeCurrency.symbol'. Received: ${nativeCurrency.symbol}`,
        })
      );
    }
  }

  const ticker = nativeCurrency?.symbol || UNKNOWN_TICKER_SYMBOL;

  if (
    ticker !== UNKNOWN_TICKER_SYMBOL &&
    (typeof ticker !== 'string' || ticker.length < 2 || ticker.length > 6)
  ) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Expected 2-6 character string 'nativeCurrency.symbol'. Received:\n${ticker}`,
      })
    );
  }
  // if the chainId is the same as an existing network but the ticker is different we want to block this action
  // as it is potentially malicious and confusing
  if (
    existingNetwork &&
    existingNetwork.chainId === parseInt(_chainId, 16) &&
    existingNetwork.symbol !== ticker
  ) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `nativeCurrency.symbol does not match currency symbol for a network the user already has added with the same chainId. Received:\n${ticker}`,
      })
    );
  }

  // create add chain window
  const newChain: RpcNetwork = {
    rpcUrl: firstValidRPCUrl,
    explorer: firstValidBlockExplorerUrl,
    chainId: parseInt(_chainId, 16),
    id: parseInt(_chainId, 16),
    symbol: ticker,
    network: NetworkType.EVM,
    name: _chainName,
  };
  let queryString = '';
  for (const key in newChain) {
    const value = encodeURIComponent(newChain[key]);
    queryString += `${key}=${value}&`;
  }
  createWindow(`evm-add-chain?${queryString}messageID=${messageID}`);

  return;
}

/**
 * Returns the first network configuration object that matches at least one field of the
 * provided search criteria. Returns null if no match is found
 *
 * @param {object} rpcInfo - The RPC endpoint properties and values to check.
 * @returns {object} rpcInfo found in the network configurations list
 */
async function findNetworkConfigurationBy(
  rpcInfo: Partial<RpcNetwork>
): Promise<RpcNetwork | null> {
  const { neoXNetworks } = await getNetworkInfo();

  const networkConfiguration = neoXNetworks.find((configuration) => {
    return Object.keys(rpcInfo).some((key) => {
      return configuration[key] === rpcInfo[key];
    });
  });

  return networkConfiguration || null;
}
