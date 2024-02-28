export interface EvmWalletJSON {
  crypto?: any;
  id?: string;
  version?: number;
  address?: string;
  name: string;
  accounts: [
    {
      address: string;
      extra: {
        publicKey: string;
        ledgerSLIP44?: string;
        ledgerAddressIndex?: number;
      };
    }
  ];
}
