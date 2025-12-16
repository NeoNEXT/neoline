import { Asset } from '@/models/models';
import { BridgeNetwork } from './transaction';

export const BRIDGE_ASSET_LIST_URL = {
  [BridgeNetwork.MainNet]:
    'https://neoline.io/assets/bridge/tokens_mainnet.json',
  [BridgeNetwork.TestNet]:
    'https://neoline.io/assets/bridge/tokens_testnet.json',
};

export const BRIDGE_TOKENS_MAINNET: { neo3: Asset[]; neox: Asset[] } = {
  neo3: [
    {
      symbol: 'GAS',
      asset_id: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
      decimals: 8,
      bridgeDecimals: 8,
    },
    {
      symbol: 'NEO',
      asset_id: '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5',
      decimals: 0,
      bridgeDecimals: 0,
      bridgeTargetAssetId: '0xc28736dc83f4fd43d6fb832Fd93c3eE7bB26828f',
    },
    {
      symbol: 'NDMEME',
      asset_id: '0x57d1761945697a2257be76b756dcc9c19b512ff1',
      decimals: 8,
      bridgeDecimals: 8,
      bridgeTargetAssetId: '0xE816deE05cf6D0F2a57EB4C489241D8326B5d106',
    },
  ],
  neox: [
    {
      symbol: 'GAS',
      asset_id: '0x0000000000000000000000000000000000000000',
      decimals: 18,
      bridgeDecimals: 8,
    },
    {
      symbol: 'NEO',
      asset_id: '0xc28736dc83f4fd43d6fb832Fd93c3eE7bB26828f',
      decimals: 18,
      bridgeDecimals: 0,
      bridgeTargetAssetId: '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5',
    },
    {
      symbol: 'NDMEME',
      asset_id: '0xE816deE05cf6D0F2a57EB4C489241D8326B5d106',
      decimals: 18,
      bridgeDecimals: 8,
      bridgeTargetAssetId: '0x57d1761945697a2257be76b756dcc9c19b512ff1',
    },
  ],
};

export const BRIDGE_TOKENS_TESTNET: { neo3: Asset[]; neox: Asset[] } = {
  neo3: [
    {
      symbol: 'GAS',
      asset_id: '0xd2a4cff31913016155e38e474a2c06d08be276cf',
      decimals: 8,
      bridgeDecimals: 8,
    },
    {
      symbol: 'NEO',
      asset_id: '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5',
      decimals: 0,
      bridgeDecimals: 0,
      bridgeTargetAssetId: '0xab0a26b8d903f36acb4bf9663f8d2de0672433cd',
    },
    {
      symbol: 'FLM',
      asset_id: '0x5b53998b399d10cd25727269e865acc785ef5c1a',
      decimals: 8,
      bridgeDecimals: 8,
      bridgeTargetAssetId: '0xba7e9465d241caabe431a79b2f863f5b2ebaebb3',
    },
  ],
  neox: [
    {
      symbol: 'GAS',
      asset_id: '0x0000000000000000000000000000000000000000',
      decimals: 18,
      bridgeDecimals: 8,
    },
    {
      symbol: 'NEO',
      asset_id: '0xab0a26b8d903f36acb4bf9663f8d2de0672433cd',
      decimals: 18,
      bridgeDecimals: 0,
      bridgeTargetAssetId: '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5',
    },
    {
      symbol: 'FLM',
      asset_id: '0xba7e9465d241caabe431a79b2f863f5b2ebaebb3',
      decimals: 8,
      bridgeDecimals: 8,
      bridgeTargetAssetId: '0x5b53998b399d10cd25727269e865acc785ef5c1a',
    },
  ],
};

export const BridgeParams = {
  [BridgeNetwork.MainNet]: {
    n3BridgeContract: '0xbb19cfc864b73159277e1fd39694b3fd5fc613d2',
    bridgeTxHostOnNeo3BridgeNeoX:
      'https://xexplorer.neo.org:8877/api/v1/transactions/deposits',
    neoXBridgeContract: '0x1212000000000000000000000000000000000004',
    bridgeTxHostOnNeoXBridgeNeo3: 'https://neofura.ngd.network/',
  },
  [BridgeNetwork.TestNet]: {
    n3BridgeContract: '0x2ba94444d43c9a084a5660982a9f95f43f07422e',
    bridgeTxHostOnNeo3BridgeNeoX:
      'https://xt4scan.ngd.network:8877/api/v1/transactions/deposits',
    neoXBridgeContract: '0x1212000000000000000000000000000000000004',
    bridgeTxHostOnNeoXBridgeNeo3: 'https://testmagnet.ngd.network/',
  },
};
