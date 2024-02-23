import { Injectable } from '@angular/core';
import { ethers } from 'ethers';

@Injectable()
export class EvmService {
  mnemonicAccountJSONs = [];
  importAccounts = [];
  constructor() {}

  async createWallet(pwd: string, name: string) {
    let wallet: ethers.HDNodeWallet;
    if (this.mnemonicAccountJSONs.length === 0) {
      wallet = ethers.Wallet.createRandom();
    } else {
      wallet = (await ethers.Wallet.fromEncryptedJson(
        this.mnemonicAccountJSONs[0],
        pwd
      )) as ethers.HDNodeWallet;
    }
    const newAccount = ethers.HDNodeWallet.fromMnemonic(
      wallet.mnemonic,
      `m/44'/60'/0'/0/${this.mnemonicAccountJSONs.length}`
    );
    const json = await newAccount.encrypt(pwd);
    const accountLike = JSON.parse(json);
    accountLike.extra = {
      publicKey: newAccount.publicKey,
      name,
    };
    this.mnemonicAccountJSONs.push(JSON.stringify(accountLike));
  }

  async importWalletFromPhrase(phrase: string, pwd: string, name: string) {
    if (this.mnemonicAccountJSONs.length > 0) return;
    const mnemonic = ethers.Mnemonic.fromPhrase(phrase);
    const account0 = ethers.HDNodeWallet.fromMnemonic(mnemonic);
    const json = await account0.encrypt(pwd);
    const accountLike = JSON.parse(json);
    accountLike.extra = {
      publicKey: account0.publicKey,
      name,
    };
    this.mnemonicAccountJSONs = [JSON.stringify(accountLike)];
  }

  async importWalletFromPrivateKey(
    privateKey: string,
    pwd: string,
    name: string
  ) {
    const wallet = new ethers.Wallet(privateKey);
    const json = await wallet.encrypt(pwd);
    const accountLike = JSON.parse(json);
    accountLike.extra = {
      publicKey: wallet.signingKey.publicKey,
      name,
    };
    this.importAccounts.push(JSON.stringify(accountLike));
  }
}
