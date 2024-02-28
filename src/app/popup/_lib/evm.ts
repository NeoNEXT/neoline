export interface EvmWalletJSON {
  crypto: any;
  id: string;
  version: number;
  address: string;
  accounts: [
    {
      address: string;
      extra: {
        name: string;
        publicKey: string;
      };
    }
  ];
}
