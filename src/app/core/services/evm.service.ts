import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { Injectable } from '@angular/core';
import { ethers } from 'ethers';

@Injectable()
export class EvmService {
  mnemonicAccounts: EvmWalletJSON[] = [];
  importAccounts = [];
  constructor() {}

  async createWallet(pwd: string, name: string) {
    let wallet: ethers.HDNodeWallet;
    if (this.mnemonicAccounts.length === 0) {
      wallet = ethers.Wallet.createRandom();
    } else {
      wallet = (await ethers.Wallet.fromEncryptedJson(
        JSON.stringify(this.mnemonicAccounts[0]),
        pwd
      )) as ethers.HDNodeWallet;
    }
    const newAccount = ethers.HDNodeWallet.fromMnemonic(
      wallet.mnemonic,
      `m/44'/60'/0'/0/${this.mnemonicAccounts.length}`
    );
    const json = await newAccount.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name;
    accountLike.accounts = [
      {
        address: newAccount.address,
        extra: {
          publicKey: newAccount.publicKey,
        },
      },
    ];
    this.mnemonicAccounts.push(accountLike);
  }

  async importWalletFromPhrase(phrase: string, pwd: string, name: string) {
    if (this.mnemonicAccounts.length > 0) return;
    const mnemonic = ethers.Mnemonic.fromPhrase(phrase);
    const account0 = ethers.HDNodeWallet.fromMnemonic(mnemonic);
    const json = await account0.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name;
    accountLike.accounts = [
      {
        address: account0.address,
        extra: {
          publicKey: account0.publicKey,
        },
      },
    ];
    this.mnemonicAccounts = [accountLike];
  }

  async importWalletFromPrivateKey(
    privateKey: string,
    pwd: string,
    name: string
  ) {
    const wallet = new ethers.Wallet(privateKey);
    const json = await wallet.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name;
    accountLike.accounts = [
      {
        address: wallet.address,
        extra: {
          publicKey: wallet.signingKey.publicKey,
        },
      },
    ];
    this.importAccounts.push(JSON.stringify(accountLike));
  }
}
