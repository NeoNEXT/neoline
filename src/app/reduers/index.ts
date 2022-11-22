import account, { AccountState } from './components/account';

export interface AppState {
  account: AccountState;
}

const rootReducer = {
  account,
};

export default rootReducer;
