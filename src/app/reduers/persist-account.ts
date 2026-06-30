import { ActionReducer, MetaReducer } from '@ngrx/store';
import {
  STORAGE_NAME,
  STORAGE_VALUE_MESSAGE,
  STORAGE_VALUE_TYPE,
  INIT_ACCOUNT,
  RESET_ACCOUNT,
  UPDATE_NEO3_WALLETS_ADDRESS,
  UPDATE_WALLET,
  ADD_NEO2_WALLETS,
  ADD_NEO3_WALLETS,
  ADD_NEOX_WALLET,
  REMOVE_NEO2_WALLET,
  REMOVE_NEO3_WALLET,
  REMOVE_NEOX_WALLET,
  UPDATE_NEO2_WALLET_NAME,
  UPDATE_NEO3_WALLET_NAME,
  UPDATE_NEOX_WALLET_NAME,
  UPDATE_NEO2_WALLET_BACKUP_STATUS,
  UPDATE_NEO3_WALLET_BACKUP_STATUS,
  UPDATE_NEOX_WALLET_BACKUP_STATUS,
  UPDATE_ALL_WALLETS,
  SORT_WALLETS,
  ADD_NEO3_NETWORK,
  ADD_NEOX_NETWORK,
  UPDATE_NEO2_NETWORKS,
  UPDATE_NEO3_NETWORKS,
  UPDATE_NEOX_NETWORKS,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_NEOX_NETWORK_INDEX,
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
 * field maps to its storage key and the transform applied before writing.
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
 * Which account fields each action is responsible for persisting — the same
 * keys the pre-meta-reducer code wrote inside each reducer case. These are
 * written UNCONDITIONALLY when the action fires, independent of reference
 * equality.
 *
 * Why this exists: detecting "what changed" by reference (`prev[f] !== next[f]`)
 * silently fails when a caller mutates a store array/object in place and then
 * dispatches the same reference — `prev` and `next` point at the same (already
 * mutated) object, so neither reference nor deep comparison can tell they
 * "changed". A force list restores the old, robust "the action targets these
 * keys, so write them" contract without reintroducing side effects into the
 * (pure) reducers. Any action NOT listed here still persists via the
 * reference-change fallback in the meta-reducer below.
 */
const ACTION_PERSISTED_FIELDS: Record<string, Array<keyof AccountState>> = {
  [UPDATE_WALLET]: ['currentWallet', 'currentChainType'],

  [ADD_NEO2_WALLETS]: ['neo2WalletArr', 'neo2WIFArr'],
  [ADD_NEO3_WALLETS]: ['neo3WalletArr', 'neo3WIFArr'],
  [ADD_NEOX_WALLET]: ['neoXWalletArr'],

  [REMOVE_NEO2_WALLET]: ['neo2WalletArr', 'neo2WIFArr'],
  [REMOVE_NEO3_WALLET]: ['neo3WalletArr', 'neo3WIFArr'],
  [REMOVE_NEOX_WALLET]: ['neoXWalletArr'],

  [UPDATE_NEO2_WALLET_NAME]: ['neo2WalletArr'],
  [UPDATE_NEO3_WALLET_NAME]: ['neo3WalletArr'],
  [UPDATE_NEOX_WALLET_NAME]: ['neoXWalletArr'],

  [UPDATE_NEO2_WALLET_BACKUP_STATUS]: ['neo2WalletArr'],
  [UPDATE_NEO3_WALLET_BACKUP_STATUS]: ['neo3WalletArr'],
  [UPDATE_NEOX_WALLET_BACKUP_STATUS]: ['neoXWalletArr'],

  [UPDATE_ALL_WALLETS]: [
    'currentWallet',
    'neo2WalletArr',
    'neo3WalletArr',
    'neo2WIFArr',
    'neo3WIFArr',
  ],

  // SORT_WALLETS touches exactly one chain's array (chosen by action.data at
  // runtime); a static map can't know which, so list all three — the unchanged
  // two are simply re-written with their current value.
  [SORT_WALLETS]: ['neo2WalletArr', 'neo3WalletArr', 'neoXWalletArr'],

  [ADD_NEO3_NETWORK]: ['n3Networks'],
  [ADD_NEOX_NETWORK]: ['neoXNetworks'],

  [UPDATE_NEO2_NETWORKS]: ['n2Networks'],
  [UPDATE_NEO3_NETWORKS]: ['n3Networks'],
  [UPDATE_NEOX_NETWORKS]: ['neoXNetworks'],

  [UPDATE_NEO2_NETWORK_INDEX]: ['n2NetworkIndex'],
  [UPDATE_NEO3_NETWORK_INDEX]: ['n3NetworkIndex'],
  [UPDATE_NEOX_NETWORK_INDEX]: ['neoXNetworkIndex'],
};

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
      const forcedFields = ACTION_PERSISTED_FIELDS[action.type] ?? [];
      for (const { field, key, serialize } of PERSISTED_FIELDS) {
        // Force-write the fields this action is responsible for (robust against
        // in-place mutation), and fall back to reference-change detection for
        // any field/action not covered by the map.
        const changed = prevAccount[field] !== nextAccount[field];
        if (forcedFields.includes(field) || changed) {
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
