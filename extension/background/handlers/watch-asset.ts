import { createWindow, getCurrentNeoXNetwork } from '../tool';
import { MESSAGE_TYPE } from '../../common/data_module_evm';
import { abiERC20 } from '../../common/evm/abiERC20';
import {
  detectIsERC1155,
  detectIsERC721,
} from '../../common/evm/tokensController';
import { ethErrors } from 'eth-rpc-errors';
import { ethers } from 'ethers';

const ERC20 = 'ERC20';
const ERC721 = 'ERC721';
const ERC1155 = 'ERC1155';

//#region constant
/**
 * @type Token
 *
 * Token representation
 * @property address - Hex address of the token contract
 * @property decimals - Number of decimals the token uses
 * @property symbol - Symbol of the token
 * @property image - Image of the token, url or bit32 image
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface Token {
  address: string;
  decimals: number;
  symbol: string;
  aggregators?: string[];
  image?: string;
  balanceError?: unknown;
  isERC721?: boolean;
  name?: string;
}
/**
 * @type SuggestedAssetMeta
 *
 * Suggested asset by EIP747 meta data
 * @property id - Generated UUID associated with this suggested asset
 * @property time - Timestamp associated with this this suggested asset
 * @property type - Type type this suggested asset
 * @property asset - Asset suggested object
 * @property interactingAddress - Account address that requested watch asset
 */
type SuggestedAssetMeta = {
  id: string;
  time: number;
  type: string;
  asset: Token;
  interactingAddress: string;
};

//#endregion

const watchAsset = {
  methodNames: [MESSAGE_TYPE.WATCH_ASSET],
  implementation: watchAssetHandler,
  hookNames: {
    handleWatchAssetRequest: true,
  },
};
export default watchAsset;
async function watchAssetHandler(params, messageID: number, hostInfo) {
  const { options: asset, type } = params;

  if (type !== ERC20) {
    return Promise.reject(
      ethErrors.rpc.invalidParams({
        message: `Asset type ${type} not supported`,
      })
    );
  }

  try {
    await handleWatchAsset({ asset, type, messageID, hostInfo });
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Adds a new suggestedAsset to the list of watched assets.
 * Parameters will be validated according to the asset type being watched.
 *
 * @param options - The method options.
 * @param options.asset - The asset to be watched. For now only ERC20 tokens are accepted.
 * @param options.type - The asset type.
 * @returns A promise that resolves if the asset was watched successfully, and rejects otherwise.
 */
async function handleWatchAsset({
  asset,
  type,
  messageID,
  hostInfo,
}: {
  asset: Token;
  type: string;
  messageID: number;
  hostInfo;
}): Promise<void> {
  if (!asset.address) {
    throw ethErrors.rpc.invalidParams({ message: 'Address must be specified' });
  }

  if (!ethers.isAddress(asset.address)) {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid address "${asset.address}"`,
    });
  }

  // Validate contract

  const { currNeoXNetwork } = await getCurrentNeoXNetwork();
  const provider = new ethers.JsonRpcProvider(currNeoXNetwork.rpcUrl);

  if (await detectIsERC721(asset.address, provider)) {
    throw ethErrors.rpc.invalidParams({
      message: `Contract ${asset.address} must match type ${type}, but was detected as ${ERC721}`,
    });
  }

  const isErc1155 = await detectIsERC1155(asset.address, provider);
  if (isErc1155) {
    throw ethErrors.rpc.invalidParams({
      message: `Contract ${asset.address} must match type ${type}, but was detected as ${ERC1155}`,
    });
  }

  const contract = new ethers.Contract(asset.address, abiERC20, provider);
  let { contractSymbol, contractName, contractDecimals } =
    await ethers.resolveProperties({
      contractSymbol: contract.symbol().catch(() => {
        throw ethErrors.rpc.invalidParams({
          message: 'Failed to parse token symbol',
        });
      }),
      contractName: contract.name().catch(() => {
        throw ethErrors.rpc.invalidParams({
          message: 'Failed to parse token name',
        });
      }),
      contractDecimals: contract.decimals().catch(() => {
        throw ethErrors.rpc.invalidParams({
          message: 'Failed to parse token decimals',
        });
      }),
    });

  contractDecimals = contractDecimals.toString();

  asset.name = contractName;

  // Validate symbol

  if (!asset.symbol && !contractSymbol) {
    throw ethErrors.rpc.invalidParams({
      message:
        'A symbol is required, but was not found in either the request or contract',
    });
  }

  if (
    contractSymbol !== undefined &&
    asset.symbol !== undefined &&
    asset.symbol.toUpperCase() !== contractSymbol.toUpperCase()
  ) {
    throw ethErrors.rpc.invalidParams({
      message: `The symbol in the request (${asset.symbol}) does not match the symbol in the contract (${contractSymbol})`,
    });
  }

  asset.symbol = contractSymbol ?? asset.symbol;
  if (typeof asset.symbol !== 'string') {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid symbol: not a string`,
    });
  }

  if (asset.symbol.length > 11) {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid symbol "${asset.symbol}": longer than 11 characters`,
    });
  }

  // Validate decimals

  if (asset.decimals === undefined && contractDecimals === undefined) {
    throw ethErrors.rpc.invalidParams({
      message:
        'Decimals are required, but were not found in either the request or contract',
    });
  }

  if (
    contractDecimals !== undefined &&
    asset.decimals !== undefined &&
    String(asset.decimals) !== contractDecimals
  ) {
    throw ethErrors.rpc.invalidParams({
      message: `The decimals in the request (${asset.decimals}) do not match the decimals in the contract (${contractDecimals})`,
    });
  }

  const decimalsStr = contractDecimals ?? asset.decimals;
  const decimalsNum = parseInt(decimalsStr as unknown as string, 10);
  if (!Number.isInteger(decimalsNum) || decimalsNum > 36 || decimalsNum < 0) {
    throw ethErrors.rpc.invalidParams({
      message: `Invalid decimals "${decimalsStr}": must be an integer 0 <= 36`,
    });
  }
  asset.decimals = decimalsNum;

  console.log(asset);

  const { address, symbol, decimals, name, image } = asset;
  const newAsset = {
    asset_id: address,
    name,
    symbol,
    avatar: image,
    decimals,
    image_url: image,
  };
  let queryString = '';
  for (const key in newAsset) {
    const value = encodeURIComponent(newAsset[key]);
    queryString += `${key}=${value}&`;
  }

  createWindow(
    `evm-add-asset?${queryString}messageID=${messageID}&icon=${hostInfo.icon}&hostname=${hostInfo.hostname}`
  );
}
