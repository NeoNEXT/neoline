import { REMOVE_NEOX_WALLET, UPDATE_WALLET } from '@/app/popup/_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { ChromeService } from './chrome.service';

@Injectable()
export class EvmService {
  private neoXWalletArr: EvmWalletJSON[];
  constructor(private store: Store<AppState>, private chrome: ChromeService) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
    });
  }

  async createWallet(pwd: string, name: string): Promise<EvmWalletJSON> {
    let wallet: ethers.HDNodeWallet;
    let maxIndexHDWallet: EvmWalletJSON = undefined;
    let newHDWalletIndex = 0;
    this.neoXWalletArr.forEach((item) => {
      if (
        item.accounts[0].extra.isHDWallet &&
        item.accounts[0].extra.hdWalletIndex > (maxIndexHDWallet ?? -1)
      ) {
        maxIndexHDWallet = item;
      }
    });
    if (maxIndexHDWallet) {
      wallet = (await ethers.Wallet.fromEncryptedJson(
        JSON.stringify(maxIndexHDWallet),
        pwd
      )) as ethers.HDNodeWallet;
      newHDWalletIndex = maxIndexHDWallet.accounts[0].extra.hdWalletIndex + 1;
    } else {
      wallet = ethers.Wallet.createRandom();
    }
    const newAccount = ethers.HDNodeWallet.fromMnemonic(
      wallet.mnemonic,
      `m/44'/60'/0'/0/${newHDWalletIndex}`
    );
    const json = await newAccount.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name;
    accountLike.accounts = [
      {
        address: newAccount.address,
        extra: {
          publicKey: newAccount.publicKey,
          isHDWallet: true,
          hdWalletIndex: newHDWalletIndex,
          hasBackup: maxIndexHDWallet
            ? maxIndexHDWallet.accounts[0].extra.hasBackup
            : false,
        },
      },
    ];
    return accountLike;
  }

  async importWalletFromPhrase(phrase: string, pwd: string, name: string) {
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
          isHDWallet: true,
          hdWalletIndex: 0,
          hasBackup: true,
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
    accountLike.name = name ?? 'NeoLineUser';
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
