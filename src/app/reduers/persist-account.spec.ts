import { ActionReducer } from '@ngrx/store';
import {
  ADD_NEO3_WALLETS,
  INIT_ACCOUNT,
  RESET_ACCOUNT,
  UPDATE_NEO2_NETWORK_INDEX,
  UPDATE_NEO3_NETWORKS,
  UPDATE_WALLET,
} from '@/app/popup/_lib';
import { persistAccountState } from './persist-account';
import account from './components/account';
import { AppState } from './index';

// Compose the real account reducer the same way StoreModule.forRoot does, then
// wrap it with the persistence meta-reducer under test. This exercises the full
// pipeline: pure reducer computes state, meta-reducer persists what changed.
const rootReducer: ActionReducer<AppState> = (state, action) => ({
  account: account(state?.account, action),
});
const reducer = persistAccountState(rootReducer);

describe('persistAccountState meta-reducer', () => {
  let setItem: jasmine.Spy;
  let originalChrome: any;
  let state: AppState;

  beforeEach(() => {
    // Force the dev / localStorage branch so writes are observable and
    // deterministic regardless of the test runner's `chrome` global.
    originalChrome = (window as any).chrome;
    (window as any).chrome = undefined;
    setItem = spyOn(localStorage, 'setItem');
    // Hydrate initial state (prev state is undefined here -> nothing persisted).
    state = reducer(undefined, { type: '@@init' } as any);
    expect(setItem).not.toHaveBeenCalled();
  });

  afterEach(() => {
    (window as any).chrome = originalChrome;
  });

  it('persists the changed slice for a state-changing action', () => {
    state = reducer(state, { type: UPDATE_NEO2_NETWORK_INDEX, data: 2 } as any);

    expect(state.account.n2NetworkIndex).toBe(2);
    expect(setItem).toHaveBeenCalledWith(
      'n2SelectedNetworkIndex',
      jasmine.any(String)
    );
    // Only the field that changed is written.
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('exports neon-js wallets before persisting them', () => {
    const fakeWallet: any = {
      export: () => ({ exported: true }),
      accounts: [{ address: 'addr' }],
    };
    state = reducer(state, {
      type: ADD_NEO3_WALLETS,
      data: { wallet: [fakeWallet], wif: ['wif-1'] },
    } as any);

    const walletCall = setItem.calls
      .all()
      .find((c) => c.args[0] === 'walletArr-Neo3');
    expect(walletCall).withContext('walletArr-Neo3 written').toBeDefined();
    // Stored as the exported JSON form, not the live instance.
    expect(JSON.parse(walletCall.args[1])).toEqual([{ exported: true }]);
    expect(setItem).toHaveBeenCalledWith('WIFArr-Neo3', jasmine.any(String));
  });

  it('does not persist for INIT_ACCOUNT (state is hydrated FROM storage)', () => {
    // Index must be valid for the default n3Networks (length 2): INIT_ACCOUNT
    // clamps an out-of-range index, so an out-of-range value here would be
    // rewritten and obscure what this test checks (that INIT does not persist).
    state = reducer(state, {
      type: INIT_ACCOUNT,
      data: { n3NetworkIndex: 1 },
    } as any);

    expect(state.account.n3NetworkIndex).toBe(1);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not persist for RESET_ACCOUNT (stored wallets must be kept)', () => {
    state = reducer(state, { type: RESET_ACCOUNT } as any);

    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not persist when the action does not change the account slice', () => {
    const before = state;
    state = reducer(state, { type: 'UNKNOWN_NOOP_ACTION' } as any);

    expect(state.account).toBe(before.account);
    expect(setItem).not.toHaveBeenCalled();
  });

  // The regression this hardening fixes: a caller holds the store array, mutates
  // it in place, and dispatches the SAME reference. prev and next share the
  // (already mutated) array, so neither reference nor deep comparison can detect
  // a change — only the action→fields force-write persists it.
  it('persists networks dispatched as the same (in-place mutated) reference', () => {
    // The initial state's n3Networks IS the shared DEFAULT_N3_RPC_NETWORK
    // constant; pushing into it directly would leak into every other spec
    // file. Swap in a fresh copy first, then mutate that copy in place.
    state = reducer(state, {
      type: UPDATE_NEO3_NETWORKS,
      data: [...state.account.n3Networks],
    } as any);
    setItem.calls.reset();

    const sameRef = state.account.n3Networks;
    (sameRef as any).push({ name: 'custom', chainId: 999 });
    state = reducer(state, {
      type: UPDATE_NEO3_NETWORKS,
      data: sameRef,
    } as any);

    // Confirm the bug condition (same reference) actually held...
    expect(state.account.n3Networks).toBe(sameRef);
    // ...and it was persisted anyway.
    expect(setItem).toHaveBeenCalledWith('n3Networks', jasmine.any(String));
  });

  it('persists the wallet key on UPDATE_WALLET for the same (mutated) wallet ref', () => {
    const fakeWallet: any = {
      accounts: [{ address: 'addr', extra: { hasBackup: false } }],
      export() {
        return { accounts: this.accounts };
      },
    };
    // First dispatch sets currentWallet (reference genuinely changes here).
    state = reducer(state, { type: UPDATE_WALLET, data: fakeWallet } as any);
    setItem.calls.reset();

    // Simulate the backup flow: mutate the SAME wallet object, dispatch it again.
    fakeWallet.accounts[0].extra.hasBackup = true;
    state = reducer(state, { type: UPDATE_WALLET, data: fakeWallet } as any);

    expect(state.account.currentWallet).toBe(fakeWallet);
    expect(setItem).toHaveBeenCalledWith('wallet', jasmine.any(String));
  });
});
