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
    const createWalletArr = this.neoXWalletArr.filter(
      (item) => item.accounts[0].extra.isHDWallet
    );
    if (createWalletArr.length > 0) {
      wallet = (await ethers.Wallet.fromEncryptedJson(
        JSON.stringify(createWalletArr[0]),
        pwd
      )) as ethers.HDNodeWallet;
    } else {
      wallet = ethers.Wallet.createRandom();
    }
    const newAccount = ethers.HDNodeWallet.fromMnemonic(
      wallet.mnemonic,
      `m/44'/60'/0'/0/${createWalletArr.length}`
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
          hasBackup:
            createWalletArr.length > 0
              ? createWalletArr[0].accounts[0].extra.hasBackup
              : false,
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
          isHDWallet: true,
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

  deleteWallet(w: EvmWalletJSON) {
    this.store.dispatch({
      type: REMOVE_NEOX_WALLET,
      data: w,
    });
    this.store.dispatch({ type: UPDATE_WALLET, data: this.neoXWalletArr[0] });
    this.chrome.accountChangeEvent(this.neoXWalletArr[0]);
  }
}
