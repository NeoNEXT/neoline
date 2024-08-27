import { ChainType } from './chain';

export interface AddAddressBookProp {
  chain: ChainType;
  name: string;
  address: string;
}
