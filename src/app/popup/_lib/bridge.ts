import { ETH_SOURCE_ASSET_HASH } from './evm';
import { GAS3_CONTRACT } from './neo3';
import { BridgeNetwork } from './transaction';

export const Neo3BridgeAssetList = {
  [BridgeNetwork.MainNet]: [
    {
      asset_id: GAS3_CONTRACT,
      decimals: 8,
      bridgeDecimals: 8,
      symbol: 'GAS',
    },
    {
      asset_id: '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5',
      decimals: 0,
      bridgeDecimals: 0,
      bridgeTargetAssetId: '0xc28736dc83f4fd43d6fb832Fd93c3eE7bB26828f',
      symbol: 'NEO',
    },
  ],
  [BridgeNetwork.TestNet]: [
    {
      asset_id: GAS3_CONTRACT,
      decimals: 8,
      bridgeDecimals: 8,
      symbol: 'GAS',
    },
    {
      asset_id: '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5',
      decimals: 0,
      bridgeDecimals: 0,
      bridgeTargetAssetId: '0xab0a26b8d903f36acb4bf9663f8d2de0672433cd',
      symbol: 'NEO',
    },
    {
      asset_id: '0x5b53998b399d10cd25727269e865acc785ef5c1a',
      decimals: 8,
      bridgeDecimals: 8,
      bridgeTargetAssetId: '0xba7e9465d241caabe431a79b2f863f5b2ebaebb3',
      symbol: 'FLM',
    },
  ],
};

export const NeoXBridgeAssetList = {
  [BridgeNetwork.MainNet]: [
    {
      asset_id: ETH_SOURCE_ASSET_HASH,
      decimals: 18,
      bridgeDecimals: 8,
      symbol: 'GAS',
    },
    {
      asset_id: '0xc28736dc83f4fd43d6fb832Fd93c3eE7bB26828f',
      decimals: 18,
      bridgeDecimals: 0,
      bridgeTargetAssetId: '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5',
      symbol: 'NEO',
    },
  ],
  [BridgeNetwork.TestNet]: [
    {
      asset_id: ETH_SOURCE_ASSET_HASH,
      decimals: 18,
      bridgeDecimals: 8,
      symbol: 'GAS',
    },
    {
      asset_id: '0xAB0A26b8d903f36acb4Bf9663f8D2De0672433cd',
      decimals: 18,
      bridgeDecimals: 0,
      bridgeTargetAssetId: '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5',
      symbol: 'NEO',
    },
    {
      asset_id: '0xba7e9465D241CaAbe431A79b2F863f5B2ebAEBB3',
      decimals: 8,
      bridgeDecimals: 8,
      bridgeTargetAssetId: '0x5b53998b399d10cd25727269e865acc785ef5c1a',
      symbol: 'FLM',
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
