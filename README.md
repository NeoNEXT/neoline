# NeoLine Chrome Extension

NeoLine is a thin wallet chrome extension, it provides dapis for developers who want to interact easily with NEO blockchain.

## Install

https://github.com/NeoNextClub/neoline/blob/master/install/en_US.md

## DAPI Reference

https://neoline.io/dapi

## environment

We recommend node v12.10.0 and npm v6.13.0, but there are no restriction on node version and npm version.

## Development

1. Ensure you have [angular-cli](https://angular.io/cli) installed.
2. Clone this repository.

1. Run `npm run initneonjs` to install neonjs.
2. Run `npm install` to install dependencies.
3. Run `npm run start` for local development.
4. Run `npm run build` to build release assets for [chrome extension debug](https://developer.chrome.com/extensions/tut_debugging).

## private chain

Currently support Neo N3 private chain.

1. git checkout -b private_chain
2. Please check the files in the environment folder for custom configuration.
3. Run `npm run initneonjs` to install neonjs.
4. Run `npm install` to install dependencies.
5. Run `npm run start` for local development.
6. Run `npm run build` to build release assets for [chrome extension debug](https://developer.chrome.com/extensions/tut_debugging).
