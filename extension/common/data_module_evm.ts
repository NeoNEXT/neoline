export enum requestTargetEVM {
  request = 'neoline.target_request_evm',
  isConnected = 'neoline.target_isConnected_evm',
}

export const RestrictedMethods = Object.freeze({
  eth_accounts: 'eth_accounts',
} as const);

export const MESSAGE_TYPE = {
  ADD_ETHEREUM_CHAIN: 'wallet_addEthereumChain',
  SWITCH_ETHEREUM_CHAIN: 'wallet_switchEthereumChain',
  // WATCH_ASSET: 'wallet_watchAsset',
  ETH_ACCOUNTS: RestrictedMethods.eth_accounts,
  ETH_REQUEST_ACCOUNTS: 'eth_requestAccounts',
} as const;

/**
 * An object containing all of the chain ids for networks both built in and
 * those that we have added custom code to support our feature set.
 */
export const CHAIN_IDS = {
  MAINNET: '0x1',
  GOERLI: '0x5',
  LOCALHOST: '0x539',
  BSC: '0x38',
  BSC_TESTNET: '0x61',
  OPTIMISM: '0xa',
  OPTIMISM_TESTNET: '0x1a4',
  BASE: '0x2105',
  BASE_TESTNET: '0x14a33',
  OPBNB: '0xcc',
  OPBNB_TESTNET: '0x15eb',
  POLYGON: '0x89',
  POLYGON_TESTNET: '0x13881',
  AVALANCHE: '0xa86a',
  AVALANCHE_TESTNET: '0xa869',
  FANTOM: '0xfa',
  FANTOM_TESTNET: '0xfa2',
  CELO: '0xa4ec',
  ARBITRUM: '0xa4b1',
  HARMONY: '0x63564c40',
  PALM: '0x2a15c308d',
  SEPOLIA: '0xaa36a7',
  LINEA_GOERLI: '0xe704',
  LINEA_MAINNET: '0xe708',
  AURORA: '0x4e454152',
  MOONBEAM: '0x504',
  MOONBEAM_TESTNET: '0x507',
  MOONRIVER: '0x505',
  CRONOS: '0x19',
  GNOSIS: '0x64',
  ZKSYNC_ERA: '0x144',
  TEST_ETH: '0x539',
} as const;

/**
 * The largest possible chain ID we can handle.
 * Explanation: https://gist.github.com/rekmarks/a47bd5f2525936c4b8eee31a16345553
 */
export const MAX_SAFE_CHAIN_ID = 4503599627370476;
export const UNKNOWN_TICKER_SYMBOL = 'UNKNOWN';
