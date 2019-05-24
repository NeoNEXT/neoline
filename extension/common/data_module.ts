export enum EVENT {
    READY = 'neoline.ready',
    ACCOUNT_CHANGED = 'neoline.account_changed',
    CONNECTED = 'neoline.connected',
    CONNECTION_REJECTED = 'neoline.connection_rejected',
    NETWORK_CHANGED = 'neoline.network_changed'
}

export enum postTarget {
    Provider = 'neoline.get_provider',
    Networks = 'neoline.get_networks',
    Account = 'neoline.get_account',
    AccountPublicKey = 'neoline.get_public_key'
}

export enum returnTarget {
    Provider = 'neoline.provider',
    Networks = 'neoline.networks',
    Account = 'neoline.account',
    AccountPublicKey = 'neoline.public_key'
}

export enum errorDescription {
    NO_PROVIDER = 'No provider available.',
    CONNECTION_DENIED = 'The user rejected the request to connect with your dApp'
}

export interface Provider {
    name: string;
    website: string;
    version: string;
    compatibility: string[];
    extra: object;
}

export interface Networks {
    networks: string[]; // Array of network names the wallet provider has available for the dapp developer to connect to.
    defaultNetwork: string; // Network the wallet is currently set to.
}

export interface Account {
    address: string; // Address of the connected account
    label?: string; // A label the users has set to identify their wallet
}

export interface AccountPublicKey {
    address: string; // Address of the connected account
    publicKey: string; // Public key of the connected account
  }

export interface Error {
    type: string; // `NO_PROVIDER`|`CONNECTION_DENIED`
    description: string;
    data: string;
}
