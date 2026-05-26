import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { v4 as uuid } from 'uuid';

@Injectable()
export class EvmWalletService {
  private neoXWalletArr: EvmWalletJSON[];

  constructor(private store: Store<AppState>) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neoXWalletArr = state.neoXWalletArr;
    });
  }
  async createWallet(pwd: string, name: string): Promise<EvmWalletJSON> {
    let maxIndexHDWallet: EvmWalletJSON;
    let newIndex = -1;
    this.neoXWalletArr.forEach((item) => {
      const extra = item.accounts[0]?.extra;
      if (
        extra?.isHDWallet &&
        extra.hdWalletId &&
        extra.encryptedJson &&
        extra.hdWalletIndex > newIndex
      ) {
        maxIndexHDWallet = item;
        newIndex = extra.hdWalletIndex;
      }
    });
    if (maxIndexHDWallet) {
      return this.deriveNextWallet(maxIndexHDWallet, pwd, name);
    }

    return this.createWalletFromMnemonic({
      mnemonic: ethers.Wallet.createRandom().mnemonic,
      pwd,
      name: name || 'NeoLineUser',
      hdWalletId: uuid(),
      hdWalletIndex: 0,
      encryptedJson: undefined,
      hasBackup: false,
    });
  }

  async importWalletFromPhrase(
    phrase: string,
    pwd: string,
    name = 'account 1'
  ) {
    const mnemonic = this.getMnemonic(phrase);
    return this.createWalletFromMnemonic({
      mnemonic,
      pwd,
      name,
      hdWalletId: uuid(),
      hdWalletIndex: 0,
      encryptedJson: undefined,
    });
  }

  async deriveNextWallet(
    maxIndexWallet: EvmWalletJSON,
    pwd: string,
    name?: string
  ): Promise<EvmWalletJSON> {
    const extra = maxIndexWallet.accounts[0].extra;
    if (!extra.hdWalletId || extra.hdWalletIndex === undefined) {
      throw new Error('This NeoX account does not contain HD metadata');
    }
    if (!extra.encryptedJson) {
      throw new Error('This NeoX account does not contain HD carrier');
    }
    const hdWallet = (await ethers.Wallet.fromEncryptedJson(
      extra.encryptedJson,
      pwd
    )) as ethers.HDNodeWallet;
    if (!hdWallet.mnemonic) {
      throw new Error('This NeoX account is not HD wallet');
    }
    const hdWalletIndex = extra.hdWalletIndex + 1;
    return this.createWalletFromMnemonic({
      mnemonic: hdWallet.mnemonic,
      pwd,
      name: name || `account ${hdWalletIndex + 1}`,
      hdWalletId: extra.hdWalletId,
      hdWalletIndex,
      encryptedJson: extra.encryptedJson,
      hasBackup: extra.hasBackup,
    });
  }

  getFirstAddressFromPhrase(phrase: string): string {
    const mnemonic = this.getMnemonic(phrase);
    return ethers.HDNodeWallet.fromMnemonic(
      mnemonic,
      `m/44'/60'/0'/0/0`
    ).address;
  }

  async importWalletFromPrivateKey(
    privateKey: string,
    pwd: string,
    name: string
  ) {
    const wallet = new ethers.Wallet(privateKey);
    const json = await wallet.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(json);
    accountLike.name = name ?? wallet.address;
    accountLike.accounts = [
      {
        address: wallet.address,
        extra: {
          publicKey: wallet.signingKey.publicKey,
          encryptedJson: json,
        },
      },
    ];
    return accountLike;
  }

  private async createWalletFromMnemonic({
    mnemonic,
    pwd,
    name,
    hdWalletId,
    hdWalletIndex,
    encryptedJson,
    hasBackup,
  }: {
    mnemonic: ethers.Mnemonic;
    pwd: string;
    name: string;
    hdWalletId: string;
    hdWalletIndex: number;
    encryptedJson?: string;
    hasBackup?: boolean;
  }) {
    const carrierJson =
      encryptedJson ||
      (await ethers.HDNodeWallet.fromMnemonic(mnemonic).encrypt(pwd));
    const account = ethers.HDNodeWallet.fromMnemonic(
      mnemonic,
      `m/44'/60'/0'/0/${hdWalletIndex}`
    );
    const accountJson = await account.encrypt(pwd);
    const accountLike: EvmWalletJSON = JSON.parse(accountJson);
    accountLike.name = name;
    accountLike.accounts = [
      {
        address: account.address,
        extra: {
          publicKey: account.publicKey,
          isHDWallet: true,
          hdWalletId,
          hdWalletIndex,
          encryptedJson: carrierJson,
          hasBackup,
        },
      },
    ];
    return accountLike;
  }

  private getMnemonic(phrase: string): ethers.Mnemonic {
    const normalized = phrase.trim().replace(/\s+/g, ' ');
    if (!ethers.Mnemonic.isValidMnemonic(normalized)) {
      throw new Error('Invalid mnemonic');
    }
    return ethers.Mnemonic.fromPhrase(normalized);
  }
}
