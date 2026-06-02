import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { AppState } from '@/app/reduers';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { getNextHDWalletId } from '../../utils/app';

@Injectable()
export class EvmWalletService {
  private neoXWalletArr: EvmWalletJSON[] = [];

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
      name: name || 'account 1',
      hdWalletId: getNextHDWalletId(this.neoXWalletArr),
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
      hdWalletId: getNextHDWalletId(this.neoXWalletArr),
      hdWalletIndex: 0,
      encryptedJson: undefined,
      // 导入助记词是恢复流程，视为已备份，不再进入备份确认
      hasBackup: true,
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
    const mnemonic = await this.getMnemonicFromHDWallet(maxIndexWallet, pwd);
    const hdWalletIndex = extra.hdWalletIndex + 1;
    return this.createWalletFromMnemonic({
      mnemonic,
      pwd,
      name: name || `account ${hdWalletIndex + 1}`,
      hdWalletId: extra.hdWalletId,
      hdWalletIndex,
      encryptedJson: extra.encryptedJson,
      hasBackup: extra.hasBackup,
    });
  }

  getFirstAddressFromPhrase(phrase: string): string {
    return this.getAddressFromPhrase(phrase, 0);
  }

  getAddressFromPhrase(phrase: string, hdWalletIndex: number): string {
    const mnemonic = this.getMnemonic(phrase);
    return ethers.HDNodeWallet.fromMnemonic(
      mnemonic,
      `m/44'/60'/0'/0/${hdWalletIndex}`
    ).address;
  }

  async getPrivateKey(wallet: EvmWalletJSON, pwd: string): Promise<string> {
    if (wallet.accounts[0]?.extra?.isHDWallet) {
      const extra = wallet.accounts[0].extra;
      if (extra.hdWalletIndex === undefined) {
        throw new Error('This NeoX account does not contain HD index');
      }
      const mnemonic = await this.getMnemonicFromHDWallet(wallet, pwd);
      return ethers.HDNodeWallet.fromMnemonic(
        mnemonic,
        `m/44'/60'/0'/0/${extra.hdWalletIndex}`
      ).privateKey;
    }
    const decryptWallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(wallet),
      pwd
    );
    return decryptWallet.privateKey;
  }

  async getMnemonicPhrase(wallet: EvmWalletJSON, pwd: string): Promise<string> {
    const mnemonic = await this.getMnemonicFromHDWallet(wallet, pwd);
    return mnemonic.phrase;
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
    return {
      name,
      accounts: [
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
      ],
    } as EvmWalletJSON;
  }

  private async getMnemonicFromHDWallet(
    wallet: EvmWalletJSON,
    pwd: string
  ): Promise<ethers.Mnemonic> {
    const encryptedJson = wallet.accounts[0]?.extra?.encryptedJson;
    if (!encryptedJson) {
      throw new Error('This NeoX account does not contain HD carrier');
    }
    const hdWallet = (await ethers.Wallet.fromEncryptedJson(
      encryptedJson,
      pwd
    )) as ethers.HDNodeWallet;
    if (!hdWallet.mnemonic) {
      throw new Error('This NeoX account is not HD wallet');
    }
    return hdWallet.mnemonic;
  }

  private getMnemonic(phrase: string): ethers.Mnemonic {
    const normalized = phrase.trim().replace(/\s+/g, ' ');
    if (!ethers.Mnemonic.isValidMnemonic(normalized)) {
      throw new Error('Invalid mnemonic');
    }
    return ethers.Mnemonic.fromPhrase(normalized);
  }
}
