import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import {
  ChainType,
  RpcNetwork,
  DEFAULT_N2_RPC_NETWORK,
  DEFAULT_N3_RPC_NETWORK,
  UPDATE_WALLET,
  ADD_NEO2_WALLET,
  ADD_NEO3_WALLET,
  REMOVE_NEO2_WALLET,
  REMOVE_NEO3_WALLET,
  ADD_NEO3_NETWORK,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  STORAGE_NAME,
  INIT_ACCOUNT,
  UPDATE_NEO3_NETWORKS,
  UPDATE_NEO3_WALLETS,
  UPDATE_NEO2_WALLETS,
  RESET_ACCOUNT,
  UPDATE_NEO2_NETWORKS,
  UPDATE_NEO2_WIFS,
  UPDATE_NEO3_WIFS,
  STORAGE_VALUE_MESSAGE,
  STORAGE_VALUE_TYPE,
} from '@/app/popup/_lib';
declare var chrome: any;

export interface AccountState {
  currentWallet: Wallet2 | Wallet3;
  currentChainType: ChainType;
  neo2WalletArr: Array<Wallet2>;
  neo3WalletArr: Array<Wallet3>;
  neo2WIFArr: string[];
  neo3WIFArr: string[];
  n2Networks: RpcNetwork[];
  n3Networks: RpcNetwork[];
  n2NetworkIndex: number;
  n3NetworkIndex: number;
}

const initialState: AccountState = {
  currentWallet: undefined,
  currentChainType: 'Neo3',
  neo2WalletArr: [],
  neo3WalletArr: [],
  neo2WIFArr: [],
  neo3WIFArr: [],
  n2Networks: DEFAULT_N2_RPC_NETWORK,
  n3Networks: DEFAULT_N3_RPC_NETWORK,
  n2NetworkIndex: 0,
  n3NetworkIndex: 0,
};

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
        neo2WIFArr: [],
        neo3WIFArr: [],
      };
    }
    case UPDATE_WALLET:
      return {
        ...state,
        ...updateWallet(action.data),
      };
    case ADD_NEO2_WALLET:
      return {
        ...state,
        ...addNeo2Wallet(action.data, state.neo2WalletArr, state.neo2WIFArr),
      };
    case ADD_NEO3_WALLET:
      return {
        ...state,
        ...addNeo3Wallet(action.data, state.neo3WalletArr, state.neo3WIFArr),
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
    case UPDATE_NEO2_WALLETS:
      return {
        ...state,
        neo2WalletArr: updateWalletArr(action.data, 'Neo2'),
      };
    case UPDATE_NEO3_WALLETS:
      return {
        ...state,
        neo3WalletArr: updateWalletArr(action.data, 'Neo3'),
      };
    case UPDATE_NEO2_WIFS:
      return {
        ...state,
        neo2WIFArr: updateWIFArr(action.data, 'Neo2'),
      };
    case UPDATE_NEO3_WIFS:
      return {
        ...state,
        neo3WIFArr: updateWIFArr(action.data, 'Neo3'),
      };
    case ADD_NEO3_NETWORK:
      return {
        ...state,
        n3Networks: addN3Network(action.data, state.n3Networks),
      };
    case UPDATE_NEO2_NETWORKS:
      return {
        ...state,
        n2Networks: updateNetworks(action.data, 'Neo2'),
      };
    case UPDATE_NEO3_NETWORKS:
      return {
        ...state,
        n3Networks: updateNetworks(action.data, 'Neo3'),
      };
    case UPDATE_NEO2_NETWORK_INDEX:
      return {
        ...state,
        n2NetworkIndex: updateNetworkIndex(action.data, 'Neo2'),
      };
    case UPDATE_NEO3_NETWORK_INDEX:
      return {
        ...state,
        n3NetworkIndex: updateNetworkIndex(action.data, 'Neo3'),
      };
    default:
      return state;
  }
}

//#region wallet
function updateWallet(data: Wallet2 | Wallet3) {
  const address = data?.accounts[0]?.address;
  const chainType: ChainType = wallet3.isAddress(address || '', 53)
    ? 'Neo3'
    : 'Neo2';
  updteLoaclStorage(STORAGE_NAME.wallet, data);
  updteLoaclStorage(STORAGE_NAME.chainType, chainType);
  return { currentWallet: data, currentChainType: chainType };
}

function updateWalletArr(data: any, chainType: ChainType) {
  if (chainType === 'Neo2') {
    updteLoaclStorage(STORAGE_NAME.walletArr, data);
  } else {
    updteLoaclStorage(STORAGE_NAME['walletArr-Neo3'], data);
  }
  return data;
}

function updateWIFArr(data: any, chainType: ChainType) {
  if (chainType === 'Neo2') {
    updteLoaclStorage(STORAGE_NAME.WIFArr, data);
  } else {
    updteLoaclStorage(STORAGE_NAME['WIFArr-Neo3'], data);
  }
  return data;
}

function addNeo2Wallet(
  data: any,
  sourceWalletArr: Wallet2[],
  sourceWIF: string[]
) {
  const targetWalletArr = [...sourceWalletArr];
  const targetWIFArr = [...sourceWIF];
  targetWalletArr.push(data.wallet);
  targetWIFArr.push(data.wif);
  updteLoaclStorage(STORAGE_NAME.walletArr, targetWalletArr);
  updteLoaclStorage(STORAGE_NAME.WIFArr, targetWIFArr);
  return { neo2WalletArr: targetWalletArr, neo2WIFArr: targetWIFArr };
}

function addNeo3Wallet(
  data: any,
  sourceWalletArr: Wallet3[],
  sourceWIF: string[]
) {
  const targetWalletArr = [...sourceWalletArr];
  const targetWIFArr = [...sourceWIF];
  targetWalletArr.push(data.wallet);
  targetWIFArr.push(data.wif);
  updteLoaclStorage(STORAGE_NAME['walletArr-Neo3'], targetWalletArr);
  updteLoaclStorage(STORAGE_NAME['WIFArr-Neo3'], targetWIFArr);
  return { neo3WalletArr: targetWalletArr, neo3WIFArr: targetWIFArr };
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
  targetWalletArr.splice(index, 1);
  targetWIFArr.splice(index, 1);
  updteLoaclStorage(STORAGE_NAME.walletArr, targetWalletArr);
  updteLoaclStorage(STORAGE_NAME.WIFArr, targetWIFArr);
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
  targetWalletArr.splice(index, 1);
  targetWIFArr.splice(index, 1);
  updteLoaclStorage(STORAGE_NAME['walletArr-Neo3'], targetWalletArr);
  updteLoaclStorage(STORAGE_NAME['WIFArr-Neo3'], targetWIFArr);
  return { neo3WalletArr: targetWalletArr, neo3WIFArr: targetWIFArr };
}
//#endregion

//#region network
function addN3Network(network: RpcNetwork, source: RpcNetwork[]) {
  const target = [...source, network];
  updteLoaclStorage(STORAGE_NAME.n3Networks, target);
  return target;
}

function updateNetworks(data: RpcNetwork[], chainType: ChainType) {
  if (chainType === 'Neo2') {
    updteLoaclStorage(STORAGE_NAME.n2Networks, data);
  } else {
    updteLoaclStorage(STORAGE_NAME.n3Networks, data);
  }
  return data;
}

function updateNetworkIndex(index: number, chainType: ChainType) {
  if (chainType === 'Neo2') {
    updteLoaclStorage(STORAGE_NAME.n2SelectedNetworkIndex, index);
  } else {
    updteLoaclStorage(STORAGE_NAME.n3SelectedNetworkIndex, index);
  }
  return index;
}
//#endregion

function updteLoaclStorage(storageName: STORAGE_NAME, value: any) {
  let storageValue = value;
  if (chrome?.runtime) {
    const saveData = {};
    saveData[storageName] = storageValue;
    if (STORAGE_VALUE_MESSAGE[storageName].isLocal) {
      chrome.storage.local.set(value, () => {
        console.log('Set local storage', value);
      });
    } else {
      chrome.storage.sync.set(value, () => {
        console.log('Set storage', value);
      });
    }
  } else {
    switch (STORAGE_VALUE_MESSAGE[storageName].type) {
      case STORAGE_VALUE_TYPE.object:
      case STORAGE_VALUE_TYPE.array:
        storageValue = JSON.stringify(value);
        break;
      case STORAGE_VALUE_TYPE.number:
      case STORAGE_VALUE_TYPE.boolean:
        storageValue = String(value);
        break;
    }
    localStorage.setItem(storageName, storageValue);
  }
}
