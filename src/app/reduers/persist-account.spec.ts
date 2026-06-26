import { ActionReducer } from '@ngrx/store';
import {
  ADD_NEO3_WALLETS,
  INIT_ACCOUNT,
  RESET_ACCOUNT,
  UPDATE_NEO2_NETWORK_INDEX,
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
    state = reducer(state, {
      type: INIT_ACCOUNT,
      data: { n3NetworkIndex: 5 },
    } as any);

    expect(state.account.n3NetworkIndex).toBe(5);
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
});
