import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';

@Injectable()
export class EvmService {
  private neoXWalletArr: EvmWalletJSON[];
  constructor(private store: Store<AppState>) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
    });
  }

  async createWallet(pwd: string, name: string): Promise<EvmWalletJSON> {
    let wallet: ethers.HDNodeWallet;
    const createWalletLength = this.neoXWalletArr.filter(
      (item) => item.accounts[0].extra.isCreate
    ).length;
    if (createWalletLength > 0) {
      wallet = (await ethers.Wallet.fromEncryptedJson(
        JSON.stringify(this.neoXWalletArr[0]),
        pwd
      )) as ethers.HDNodeWallet;
    } else {
      wallet = ethers.Wallet.createRandom();
    }
    const newAccount = ethers.HDNodeWallet.fromMnemonic(
      wallet.mnemonic,
      `m/44'/60'/0'/0/${createWalletLength}`
    );
    const json = await newAccount.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name;
    accountLike.accounts = [
      {
        address: newAccount.address,
        extra: {
          publicKey: newAccount.publicKey,
          isCreate: true,
        },
      },
    ];
    return accountLike;
  }

  async importWalletFromPhrase(phrase: string, pwd: string, name: string) {
    if (this.neoXWalletArr.length > 0) return;
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
          isCreate: true,
        },
      },
    ];
    return accountLike;
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
    return accountLike;
  }
}
