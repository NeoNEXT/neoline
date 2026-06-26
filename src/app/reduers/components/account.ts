import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { SORT_WALLETS, Wallet3 } from '@popup/_lib';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import {
  ChainType,
  RpcNetwork,
  DEFAULT_N2_RPC_NETWORK,
  DEFAULT_N3_RPC_NETWORK,
  UPDATE_WALLET,
  ADD_NEO2_WALLETS,
  ADD_NEO3_WALLETS,
  ADD_NEOX_WALLET,
  REMOVE_NEO2_WALLET,
  REMOVE_NEO3_WALLET,
  ADD_NEO3_NETWORK,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  INIT_ACCOUNT,
  UPDATE_NEO3_NETWORKS,
  RESET_ACCOUNT,
  UPDATE_NEO2_NETWORKS,
  UPDATE_NEO2_WALLET_NAME,
  UPDATE_NEO3_WALLET_NAME,
  UPDATE_NEO3_WALLETS_ADDRESS,
  UPDATE_ALL_WALLETS,
  REMOVE_NEOX_WALLET,
  UPDATE_NEOX_WALLET_NAME,
  ADD_NEOX_NETWORK,
  UPDATE_NEOX_NETWORKS,
  UPDATE_NEOX_NETWORK_INDEX,
  UPDATE_NEO2_WALLET_BACKUP_STATUS,
  UPDATE_NEO3_WALLET_BACKUP_STATUS,
  UPDATE_NEOX_WALLET_BACKUP_STATUS,
} from '@/app/popup/_lib';
import { EvmWalletJSON, DEFAULT_NEOX_RPC_NETWORK } from '@/app/popup/_lib/evm';
import { ethers } from 'ethers';

export interface AccountState {
  currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  currentChainType: ChainType;
  neo2WalletArr: Array<Wallet2>;
  neo3WalletArr: Array<Wallet3>;
  neoXWalletArr: Array<EvmWalletJSON>;
  neo2WIFArr: string[];
  neo3WIFArr: string[];
  n2Networks: RpcNetwork[];
  n3Networks: RpcNetwork[];
  neoXNetworks: RpcNetwork[];
  n2NetworkIndex: number;
  n3NetworkIndex: number;
  neoXNetworkIndex: number;
}

const initialState: AccountState = {
  currentWallet: undefined,
  currentChainType: 'Neo3',
  neo2WalletArr: [],
  neo3WalletArr: [],
  neoXWalletArr: [],
  neo2WIFArr: [],
  neo3WIFArr: [],
  n2Networks: DEFAULT_N2_RPC_NETWORK,
  n3Networks: DEFAULT_N3_RPC_NETWORK,
  neoXNetworks: DEFAULT_NEOX_RPC_NETWORK,
  n2NetworkIndex: 0,
  n3NetworkIndex: 0,
  neoXNetworkIndex: 0,
};

// This reducer is pure: it only computes the next state. Persisting the changed
// slices to extension/local storage is handled by the persistAccountState
// meta-reducer (see ../persist-account.ts).
export default function account(
  state = initialState,
  action: any
): AccountState {
  switch (action.type) {
    case INIT_ACCOUNT:
      return {
        ...state,
        ...action.data,
      };
    case RESET_ACCOUNT: {
      return {
        ...state,
        currentWallet: undefined,
        currentChainType: 'Neo3',
        neo2WalletArr: [],
        neo3WalletArr: [],
        neoXWalletArr: [],
        neo2WIFArr: [],
        neo3WIFArr: [],
      };
    }
    case UPDATE_WALLET:
      return {
        ...state,
        ...updateWallet(action.data),
      };
    case ADD_NEO2_WALLETS:
      return {
        ...state,
        ...addNeo2Wallet(action.data, state.neo2WalletArr, state.neo2WIFArr),
      };
    case ADD_NEO3_WALLETS:
      return {
        ...state,
        ...addNeo3Wallet(action.data, state.neo3WalletArr, state.neo3WIFArr),
      };
    case ADD_NEOX_WALLET:
      return {
        ...state,
        ...addNeoXWallet(action.data, state.neoXWalletArr),
      };
    case REMOVE_NEO2_WALLET:
      return {
        ...state,
        ...removeNeo2Wallet(action.data, state.neo2WalletArr, state.neo2WIFArr),
      };
    case REMOVE_NEO3_WALLET:
      return {
        ...state,
        ...removeNeo3Wallet(action.data, state.neo3WalletArr, state.neo3WIFArr),
      };
    case REMOVE_NEOX_WALLET:
      return {
        ...state,
        ...removeNeoXWallet(action.data, state.neoXWalletArr),
      };
    case UPDATE_NEO2_WALLET_NAME:
      return {
        ...state,
        neo2WalletArr: updateWalletName(action.data, state.neo2WalletArr),
      };
    case UPDATE_NEO3_WALLET_NAME:
      return {
        ...state,
        neo3WalletArr: updateWalletName(action.data, state.neo3WalletArr),
      };
    case UPDATE_NEOX_WALLET_NAME:
      return {
        ...state,
        neoXWalletArr: updateWalletName(action.data, state.neoXWalletArr),
      };
    case UPDATE_NEO2_WALLET_BACKUP_STATUS:
      return {
        ...state,
        neo2WalletArr: updateWalletBackupStatus(
          action.data,
          state.neo2WalletArr,
          'Neo2'
        ),
      };
    case UPDATE_NEO3_WALLET_BACKUP_STATUS:
      return {
        ...state,
        neo3WalletArr: updateWalletBackupStatus(
          action.data,
          state.neo3WalletArr,
          'Neo3'
        ),
      };
    case UPDATE_NEOX_WALLET_BACKUP_STATUS:
      return {
        ...state,
        neoXWalletArr: updateWalletBackupStatus(
          action.data,
          state.neoXWalletArr,
          'NeoX'
        ),
      };
    case UPDATE_NEO3_WALLETS_ADDRESS:
      return {
        ...state,
        neo3WalletArr: action.data,
      };
    case UPDATE_ALL_WALLETS:
      return {
        ...state,
        ...updateAllWallets(action.data),
      };
    case SORT_WALLETS:
      return {
        ...state,
        ...sortWallets(action.data),
      };
    case ADD_NEO3_NETWORK:
      return {
        ...state,
        n3Networks: addN3Network(action.data, state.n3Networks),
      };
    case ADD_NEOX_NETWORK:
      return {
        ...state,
        neoXNetworks: addNeoXNetwork(action.data, state.neoXNetworks),
      };
    case UPDATE_NEO2_NETWORKS:
      return {
        ...state,
        n2Networks: action.data,
      };
    case UPDATE_NEO3_NETWORKS:
      return {
        ...state,
        n3Networks: action.data,
      };
    case UPDATE_NEOX_NETWORKS:
      return {
        ...state,
        neoXNetworks: action.data,
      };
    case UPDATE_NEO2_NETWORK_INDEX:
      return {
        ...state,
        n2NetworkIndex: action.data,
      };
    case UPDATE_NEO3_NETWORK_INDEX:
      return {
        ...state,
        n3NetworkIndex: action.data,
      };
    case UPDATE_NEOX_NETWORK_INDEX:
      return {
        ...state,
        neoXNetworkIndex: action.data,
      };
    default:
      return state;
  }
}

//#region wallet
function updateWallet(data: Wallet2 | Wallet3) {
  let chainType: ChainType = 'Neo3';
  const address = data?.accounts[0]?.address;
  if (ethers.isAddress(address)) {
    chainType = 'NeoX';
  } else {
    chainType = wallet3.isAddress(address || '', 53) ? 'Neo3' : 'Neo2';
  }
  return { currentWallet: data, currentChainType: chainType };
}

function addNeo2Wallet(
  data: any,
  sourceWalletArr: Wallet2[],
  sourceWIF: string[]
) {
  const targetWalletArr = [...sourceWalletArr];
  const targetWIFArr = [...sourceWIF];
  targetWalletArr.push(...data.wallet);
  targetWIFArr.push(...data.wif);
  return { neo2WalletArr: targetWalletArr, neo2WIFArr: targetWIFArr };
}

function addNeo3Wallet(
  data: any,
  sourceWalletArr: Wallet3[],
  sourceWIF: string[]
) {
  const targetWalletArr = [...sourceWalletArr];
  const targetWIFArr = [...sourceWIF];
  targetWalletArr.push(...data.wallet);
  targetWIFArr.push(...data.wif);
  return { neo3WalletArr: targetWalletArr, neo3WIFArr: targetWIFArr };
}

function addNeoXWallet(data: any, sourceWalletArr: EvmWalletJSON[]) {
  const targetWalletArr = [...sourceWalletArr];
  targetWalletArr.push(data.wallet);
  return { neoXWalletArr: targetWalletArr };
}

function removeNeo2Wallet(
  data: Wallet2,
  sourceWalletArr: Wallet2[],
  sourceWIFArr: string[]
) {
  const index = sourceWalletArr.findIndex(
    (m) => m.accounts[0].address === data.accounts[0].address
  );
  const targetWalletArr = [...sourceWalletArr];
  const targetWIFArr = [...sourceWIFArr];
  if (index >= 0) {
    targetWalletArr.splice(index, 1);
    targetWIFArr.splice(index, 1);
  }
  return { neo2WalletArr: targetWalletArr, neo2WIFArr: targetWIFArr };
}

function removeNeo3Wallet(
  data: Wallet3,
  sourceWalletArr: Wallet3[],
  sourceWIFArr: string[]
) {
  const index = sourceWalletArr.findIndex(
    (m) => m.accounts[0].address === data.accounts[0].address
  );
  const targetWalletArr = [...sourceWalletArr];
  const targetWIFArr = [...sourceWIFArr];
  if (index >= 0) {
    targetWalletArr.splice(index, 1);
    targetWIFArr.splice(index, 1);
  }
  return { neo3WalletArr: targetWalletArr, neo3WIFArr: targetWIFArr };
}

function removeNeoXWallet(
  data: EvmWalletJSON,
  sourceWalletArr: EvmWalletJSON[]
) {
  const index = sourceWalletArr.findIndex(
    (m) => m.accounts[0].address === data.accounts[0].address
  );
  const targetWalletArr = [...sourceWalletArr];
  if (index >= 0) {
    targetWalletArr.splice(index, 1);
  }
  return { neoXWalletArr: targetWalletArr };
}

function updateWalletName(
  data: any,
  sourceWalletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>
): any {
  const targetWalletArr = [...sourceWalletArr];
  targetWalletArr.find(
    (item) => item.accounts[0].address === data.address
  ).name = data.name;
  return targetWalletArr;
}

function updateWalletBackupStatus(
  data: any,
  sourceWalletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>,
  chainType: ChainType
): any {
  const targetWalletArr = [...sourceWalletArr];
  if (chainType === 'Neo2') {
    targetWalletArr.find(
      (item) => item.accounts[0].address === data.address
    ).accounts[0].extra.hasBackup = true;
  }
  if (chainType === 'Neo3' || chainType === 'NeoX') {
    targetWalletArr.forEach((item) => {
      const extra = item.accounts[0].extra;
      const isSameHDWalletGroup =
        data.hdWalletId &&
        extra?.isHDWallet &&
        extra.hdWalletId === data.hdWalletId;
      const isSameAccount = item.accounts[0].address === data.address;
      if (isSameHDWalletGroup || (!data.hdWalletId && isSameAccount)) {
        item.accounts[0].extra.hasBackup = true;
      }
    });
  }
  return targetWalletArr;
}

function updateAllWallets({
  currentWallet,
  neo2WalletArr,
  neo3WalletArr,
  neo2WIFArr,
  neo3WIFArr,
}) {
  return {
    currentWallet,
    neo2WalletArr,
    neo3WalletArr,
    neo2WIFArr,
    neo3WIFArr,
  };
}

function sortWallets({
  chainType,
  walletArr,
}: {
  chainType: ChainType;
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
}) {
  switch (chainType) {
    case 'Neo2':
      return { neo2WalletArr: walletArr as Wallet2[] };
    case 'Neo3':
      return { neo3WalletArr: walletArr as Wallet3[] };
    case 'NeoX':
      return { neoXWalletArr: walletArr as EvmWalletJSON[] };
  }
}
//#endregion

//#region network
function addN3Network(network: RpcNetwork, source: RpcNetwork[]) {
  return [...source, network];
}

function addNeoXNetwork(network: RpcNetwork, source: RpcNetwork[]) {
  return [...source, network];
}
//#endregion
