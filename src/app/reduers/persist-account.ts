import { ActionReducer, MetaReducer } from '@ngrx/store';
import {
  STORAGE_NAME,
  STORAGE_VALUE_MESSAGE,
  STORAGE_VALUE_TYPE,
  INIT_ACCOUNT,
  RESET_ACCOUNT,
  UPDATE_NEO3_WALLETS_ADDRESS,
} from '@/app/popup/_lib';
import { AppState } from './index';
import { AccountState } from './components/account';

declare var chrome: any;

/**
 * Persists a single storage key. Mirrors the original in-reducer behaviour:
 * inside the extension it delegates to the background worker via runtime
 * messaging, otherwise (dev / no extension) it writes browser localStorage with
 * the type-aware serialisation declared in STORAGE_VALUE_MESSAGE.
 */
function writeStorage(storageName: STORAGE_NAME, value: any): void {
  if (
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    typeof chrome.runtime.id === 'string'
  ) {
    const saveData = { [storageName]: value };
    chrome.runtime.sendMessage(
      {
        type: STORAGE_VALUE_MESSAGE[storageName].isLocal
          ? 'localStorage'
          : 'syncStorage',
        method: 'set',
        data: saveData,
      },
      () => {}
    );
    return;
  }
  let storageValue: any = value;
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

/**
 * neon-js (Neo2/Neo3) wallets are persisted in their exported JSON form, not as
 * live instances. EVM (NeoX) wallets are already plain JSON, so they pass
 * through unchanged.
 */
function exportWallet(wallet: any): any {
  return wallet && typeof wallet.export === 'function'
    ? wallet.export()
    : wallet;
}
function exportWalletArr(walletArr: any[]): any[] {
  return (walletArr ?? []).map(exportWallet);
}

const identity = (value: any): any => value;

/**
 * Single source of truth for what the account slice persists: each persisted
 * field maps to its storage key and the transform applied before writing. The
 * meta-reducer writes a key only when its backing field actually changed.
 */
const PERSISTED_FIELDS: Array<{
  field: keyof AccountState;
  key: STORAGE_NAME;
  serialize: (value: any) => any;
}> = [
  { field: 'currentWallet', key: STORAGE_NAME.wallet, serialize: exportWallet },
  { field: 'currentChainType', key: STORAGE_NAME.chainType, serialize: identity },
  { field: 'neo2WalletArr', key: STORAGE_NAME.walletArr, serialize: exportWalletArr },
  {
    field: 'neo3WalletArr',
    key: STORAGE_NAME['walletArr-Neo3'],
    serialize: exportWalletArr,
  },
  {
    field: 'neoXWalletArr',
    key: STORAGE_NAME['walletArr-NeoX'],
    serialize: identity,
  },
  { field: 'neo2WIFArr', key: STORAGE_NAME.WIFArr, serialize: identity },
  { field: 'neo3WIFArr', key: STORAGE_NAME['WIFArr-Neo3'], serialize: identity },
  { field: 'n2Networks', key: STORAGE_NAME.n2Networks, serialize: identity },
  { field: 'n3Networks', key: STORAGE_NAME.n3Networks, serialize: identity },
  { field: 'neoXNetworks', key: STORAGE_NAME.neoXNetworks, serialize: identity },
  {
    field: 'n2NetworkIndex',
    key: STORAGE_NAME.n2SelectedNetworkIndex,
    serialize: identity,
  },
  {
    field: 'n3NetworkIndex',
    key: STORAGE_NAME.n3SelectedNetworkIndex,
    serialize: identity,
  },
  {
    field: 'neoXNetworkIndex',
    key: STORAGE_NAME.neoXSelectedNetworkIndex,
    serialize: identity,
  },
];

/**
 * Actions that change the account slice in memory only. The original reducer
 * deliberately did not write storage for these — INIT hydrates state FROM
 * storage, RESET clears the in-memory session but keeps stored wallets, and
 * UPDATE_NEO3_WALLETS_ADDRESS is a transient display update — so they are
 * excluded from persistence here too.
 */
const NON_PERSISTED_ACTIONS = new Set<string>([
  INIT_ACCOUNT,
  RESET_ACCOUNT,
  UPDATE_NEO3_WALLETS_ADDRESS,
]);

/**
 * Meta-reducer that persists changed account fields to extension/local storage
 * after each action. Isolating persistence here keeps the reducers themselves
 * pure, which NgRx requires (a reducer must be a side-effect-free function of
 * its inputs).
 */
export function persistAccountState(
  reducer: ActionReducer<AppState>
): ActionReducer<AppState> {
  return (state, action) => {
    const nextState = reducer(state, action);
    const prevAccount = state?.account;
    const nextAccount = nextState?.account;
    if (
      prevAccount &&
      nextAccount &&
      nextAccount !== prevAccount &&
      !NON_PERSISTED_ACTIONS.has(action.type)
    ) {
      for (const { field, key, serialize } of PERSISTED_FIELDS) {
        if (prevAccount[field] !== nextAccount[field]) {
          writeStorage(key, serialize(nextAccount[field]));
        }
      }
    }
    return nextState;
  };
}

export const accountMetaReducers: MetaReducer<AppState>[] = [
  persistAccountState,
];
