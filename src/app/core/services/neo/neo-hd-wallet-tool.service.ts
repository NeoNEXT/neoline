import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { bytesToHex } from '@noble/hashes/utils';
import { Account3, Wallet3 } from '@popup/_lib';
import { derivePathNist256p1 } from '../../utils/slip10-nist256p1';

@Injectable()
export class NeoHdWalletToolService {
  async createWallet(
    password: string,
    accountName = 'account 1',
    hdWalletId = 'Wallet 1',
  ): Promise<Wallet3> {
    const mnemonic = ethers.Wallet.createRandom().mnemonic;
    const encryptedJson = await ethers.HDNodeWallet.fromMnemonic(
      mnemonic,
    ).encrypt(password);
    return this.deriveWalletFromMnemonic({
      mnemonic,
      password,
      accountName,
      encryptedJson,
      hdWalletId,
      hdWalletIndex: 0,
      isHdCreateWallet: true,
      hasBackup: false,
    });
  }

  async getFirstWalletFromPhrase(
    phrase: string,
    password: string,
    accountName = 'account 1',
    hdWalletId = 'Wallet 1',
  ): Promise<Wallet3> {
    const mnemonic = this.getMnemonic(phrase);
    const encryptedJson = await ethers.HDNodeWallet.fromMnemonic(
      mnemonic,
    ).encrypt(password);
    return this.deriveWalletFromMnemonic({
      mnemonic,
      password,
      accountName,
      encryptedJson,
      hdWalletId,
      hdWalletIndex: 0,
      // 导入助记词是恢复流程，视为已备份，不再进入备份确认
      hasBackup: true,
    });
  }

  async deriveNextWallet(
    wallet: Wallet3,
    password: string,
    accountName?: string,
  ): Promise<Wallet3> {
    const meta = this.getHdMeta(wallet);
    const mnemonic = await this.getMnemonicFromWallet(wallet, password);
    const hdWalletIndex = meta.hdWalletIndex + 1;
    return this.deriveWalletFromMnemonic({
      mnemonic,
      password,
      accountName: accountName || `account ${hdWalletIndex + 1}`,
      encryptedJson: meta.encryptedJson,
      hdWalletId: meta.hdWalletId,
      hdWalletIndex,
      isHdCreateWallet: meta.isHdCreateWallet,
      hasBackup: meta.hasBackup,
    });
  }

  async getFirstAddressFromMnemonic(phrase: string): Promise<string> {
    return this.getAddressFromMnemonic(phrase, 0);
  }

  async getAddressFromMnemonic(
    phrase: string,
    hdWalletIndex: number,
  ): Promise<string> {
    const mnemonic = this.getMnemonic(phrase);
    const privateKey = await this.getPrivateKey(mnemonic, hdWalletIndex);
    return new Account3(privateKey).address;
  }

  private async deriveWalletFromMnemonic({
    mnemonic,
    password,
    accountName,
    encryptedJson,
    hdWalletId,
    hdWalletIndex,
    isHdCreateWallet,
    hasBackup,
  }: {
    mnemonic: ethers.Mnemonic;
    password: string;
    accountName: string;
    encryptedJson: string;
    hdWalletId: string;
    hdWalletIndex: number;
    isHdCreateWallet?: boolean;
    hasBackup?: boolean;
  }) {
    const account = new Account3(await this.getPrivateKey(mnemonic, hdWalletIndex));
    account.label = accountName;
    account.extra = {
      isHDWallet: true,
      hdWalletId,
      hdWalletIndex,
      ...(isHdCreateWallet ? { isHdCreateWallet: true } : {}),
      encryptedJson,
      publicKey: account.publicKey,
      hasBackup,
    };

    const wallet = new Wallet3({ name: accountName });
    wallet.addAccount(account);
    await wallet.accounts[0].encrypt(password);
    return wallet;
  }

  private async getPrivateKey(
    mnemonic: ethers.Mnemonic,
    hdWalletIndex: number,
  ): Promise<string> {
    const seed = ethers.getBytes(mnemonic.computeSeed());
    const privateKey = derivePathNist256p1(
      seed,
      `m/44'/888'/0'/0/${hdWalletIndex}`,
    );
    return bytesToHex(privateKey);
  }

  private getHdMeta(wallet: Wallet3) {
    const extra = wallet.accounts?.[0]?.extra;
    if (!extra?.hdWalletId || extra.hdWalletIndex === undefined) {
      throw new Error('This neo n3 account does not contain HD metadata');
    }
    if (!extra.encryptedJson) {
      throw new Error('This neo n3 account does not contain HD carrier');
    }
    return {
      hdWalletId: extra.hdWalletId as string,
      hdWalletIndex: extra.hdWalletIndex as number,
      isHdCreateWallet: extra.isHdCreateWallet,
      encryptedJson: extra.encryptedJson as string,
      hasBackup: extra.hasBackup as boolean | undefined,
    };
  }

  private async getMnemonicFromWallet(
    wallet: Wallet3,
    password: string,
  ): Promise<ethers.Mnemonic> {
    const hdWallet = (await ethers.Wallet.fromEncryptedJson(
      this.getHdMeta(wallet).encryptedJson,
      password,
    )) as ethers.HDNodeWallet;
    if (!hdWallet.mnemonic) {
      throw new Error('This account is not HD wallet');
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
