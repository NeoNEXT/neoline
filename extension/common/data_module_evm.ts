export enum requestTargetEVM {
  request = 'neoline.target_request_evm',
  isConnected = 'neoline.target_isConnected_evm',
}

export const RestrictedMethods = Object.freeze({
  eth_accounts: 'eth_accounts',
  ///: BEGIN:ONLY_INCLUDE_IF(snaps)
  snap_dialog: 'snap_dialog',
  snap_notify: 'snap_notify',
  snap_manageState: 'snap_manageState',
  snap_getBip32PublicKey: 'snap_getBip32PublicKey',
  snap_getBip32Entropy: 'snap_getBip32Entropy',
  snap_getBip44Entropy: 'snap_getBip44Entropy',
  snap_getEntropy: 'snap_getEntropy',
  snap_getLocale: 'snap_getLocale',
  wallet_snap: 'wallet_snap',
  ///: END:ONLY_INCLUDE_IF
  ///: BEGIN:ONLY_INCLUDE_IF(keyring-snaps)
  snap_manageAccounts: 'snap_manageAccounts',
  ///: END:ONLY_INCLUDE_IF
} as const);

export const MESSAGE_TYPE = {
  ADD_ETHEREUM_CHAIN: 'wallet_addEthereumChain',
  ETH_ACCOUNTS: RestrictedMethods.eth_accounts,
  ETH_DECRYPT: 'eth_decrypt',
  ETH_CHAIN_ID: 'eth_chainId',
  ETH_GET_ENCRYPTION_PUBLIC_KEY: 'eth_getEncryptionPublicKey',
  ETH_GET_BLOCK_BY_NUMBER: 'eth_getBlockByNumber',
  ETH_REQUEST_ACCOUNTS: 'eth_requestAccounts',
  ETH_SIGN: 'eth_sign',
  ETH_SIGN_TYPED_DATA: 'eth_signTypedData',
  ETH_SIGN_TYPED_DATA_V3: 'eth_signTypedData_v3',
  ETH_SIGN_TYPED_DATA_V4: 'eth_signTypedData_v4',
  GET_PROVIDER_STATE: 'metamask_getProviderState',
  LOG_WEB3_SHIM_USAGE: 'metamask_logWeb3ShimUsage',
  PERSONAL_SIGN: 'personal_sign',
  SEND_METADATA: 'metamask_sendDomainMetadata',
  SWITCH_ETHEREUM_CHAIN: 'wallet_switchEthereumChain',
  TRANSACTION: 'transaction',
  WALLET_REQUEST_PERMISSIONS: 'wallet_requestPermissions',
  WATCH_ASSET: 'wallet_watchAsset',
  WATCH_ASSET_LEGACY: 'metamask_watchAsset',
  ///: BEGIN:ONLY_INCLUDE_IF(snaps)
  SNAP_DIALOG_ALERT: `${RestrictedMethods.snap_dialog}:alert`,
  SNAP_DIALOG_CONFIRMATION: `${RestrictedMethods.snap_dialog}:confirmation`,
  SNAP_DIALOG_PROMPT: `${RestrictedMethods.snap_dialog}:prompt`,
  ///: END:ONLY_INCLUDE_IF
  ///: BEGIN:ONLY_INCLUDE_IF(build-mmi)
  MMI_AUTHENTICATE: 'metamaskinstitutional_authenticate',
  MMI_REAUTHENTICATE: 'metamaskinstitutional_reauthenticate',
  MMI_REFRESH_TOKEN: 'metamaskinstitutional_refresh_token',
  MMI_SUPPORTED: 'metamaskinstitutional_supported',
  MMI_PORTFOLIO: 'metamaskinstitutional_portfolio',
  MMI_OPEN_SWAPS: 'metamaskinstitutional_open_swaps',
  MMI_CHECK_IF_TOKEN_IS_PRESENT: 'metamaskinstitutional_checkIfTokenIsPresent',
  MMI_SET_ACCOUNT_AND_NETWORK: 'metamaskinstitutional_setAccountAndNetwork',
  MMI_OPEN_ADD_HARDWARE_WALLET: 'metamaskinstitutional_openAddHardwareWallet',
  ///: END:ONLY_INCLUDE_IF
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
