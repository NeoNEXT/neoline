// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

/**
 * @param neo3MainRPC Custom configuration for node path.
 * @param neo3TestRPC Custom configuration for node path.
 */
export const environment = {
    production: false,
    name: 'default',
    mainApiBase: 'https://api.neoline.io',
    mainRPC: 'https://neo2-mainnet.neoline.io',
    testRPC: 'https://neo2-testnet.neoline.io',
    neo3MainRPC: 'https://neo3-testnet.neoline.vip',
    neo3TestRPC: 'https://neo3-testnet.neoline.vip',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
