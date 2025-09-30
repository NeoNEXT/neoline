import { Injectable } from '@angular/core';
import Neon2, { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Account3, Wallet3 } from '@popup/_lib';
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChromeService } from '../chrome.service';
import { EVENT } from '@/models/dapi';
import {
  ChainType,
  UPDATE_WALLET,
  REMOVE_NEO2_WALLET,
  REMOVE_NEO3_WALLET,
  REMOVE_NEOX_WALLET,
  RESET_ACCOUNT,
} from '@popup/_lib';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { ethers } from 'ethers';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { EvmWalletService } from '../evm/wallet.service';
import { SelectChainState } from '../../states/select-chain.state';

@Injectable()
export class NeoWalletService {
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  private neoXWalletArr: EvmWalletJSON[];
  constructor(
    private chrome: ChromeService,
    private evmService: EvmWalletService,
    private selectChainState: SelectChainState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
    });
  }

  /**
   * 判断钱包地址是否存在
   * @param w 钱包地址
   */
  public verifyWallet(w: Wallet2 | Wallet3 | EvmWalletJSON): boolean {
    let walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON> =
      this.neo2WalletArr;
    if (ethers.isAddress(w.accounts[0].address)) {
      walletArr = this.neoXWalletArr;
    }
    if (wallet3.isAddress(w.accounts[0].address, 53)) {
      walletArr = this.neo3WalletArr;
    }
    if (walletArr.length === 0) {
      return true;
    } else {
      if (
        walletArr.findIndex(
          (item) => item.accounts[0].address === w.accounts[0].address
        ) >= 0
      ) {
        return false;
      } else {
        return true;
      }
    }
  }

  //#region create/delete wallet
  /**
   * Create a new wallet include one NEP6 account.
   * 创建包含单个NEP6的新钱包
   * @param key encrypt password for new address
   */
  public createWallet(key: string, name: string = null): Promise<any> {
    if (this.selectChainState.selectedChainType === 'Neo2') {
      const privateKey = wallet2.generatePrivateKey();
      const account = new wallet2.Account(privateKey);
      account.extra = { hasBackup: false };
      const w = Neon2.create.wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      const wif = w.accounts[0].WIF;
      return w.accounts[0].encrypt(key).then(() => {
        (w.accounts[0] as any).wif = wif;
        return w;
      });
    } else if (this.selectChainState.selectedChainType === 'Neo3') {
      const account = new Account3();
      account.extra = { hasBackup: false };
      const wif = account.WIF;
      const w = new wallet3.Wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      return w.accounts[0].encrypt(key).then(() => {
        (w.accounts[0] as any).wif = wif;
        return w;
      });
    } else if (this.selectChainState.selectedChainType === 'NeoX') {
      return this.evmService.createWallet(key, name);
    }
  }
  public delWallet(
    deleteWallet: Wallet2 | Wallet3 | EvmWalletJSON,
    deleteChainType: ChainType,
    isDeleteCurrentWallet: boolean
  ) {
    if (
      this.neo2WalletArr.length +
        this.neo3WalletArr.length +
        this.neoXWalletArr.length <=
      1
    ) {
      this.store.dispatch({ type: RESET_ACCOUNT });
      this.chrome.resetWallet();
      this.chrome.windowCallback({
        data: {
          address: deleteWallet.accounts[0].address || '',
          label: deleteWallet.name || '',
        },
        return: EVENT.DISCONNECTED,
      });
      return;
    }
    let newWallet;
    if (isDeleteCurrentWallet) {
      switch (deleteChainType) {
        case 'Neo2':
          const neo2Index = this.neo2WalletArr.findIndex(
            (item) =>
              item.accounts[0].address === deleteWallet.accounts[0].address
          );
          if (this.neo2WalletArr.length > 1) {
            newWallet =
              neo2Index === 0 ? this.neo2WalletArr[1] : this.neo2WalletArr[0];
          } else {
            if (this.neo3WalletArr.length > 0) {
              newWallet = this.neo3WalletArr[0];
            } else if (this.neoXWalletArr.length > 0) {
              newWallet = this.neoXWalletArr[0];
            }
          }
          break;
        case 'Neo3':
          const neo3Index = this.neo3WalletArr.findIndex(
            (item) =>
              item.accounts[0].address === deleteWallet.accounts[0].address
          );
          if (this.neo3WalletArr.length > 1) {
            newWallet =
              neo3Index === 0 ? this.neo3WalletArr[1] : this.neo3WalletArr[0];
          } else {
            if (this.neo2WalletArr.length > 0) {
              newWallet = this.neo2WalletArr[0];
            } else if (this.neoXWalletArr.length > 0) {
              newWallet = this.neoXWalletArr[0];
            }
          }
          break;
        case 'NeoX':
          const neoXIndex = this.neoXWalletArr.findIndex(
            (item) =>
              item.accounts[0].address === deleteWallet.accounts[0].address
          );
          if (this.neoXWalletArr.length > 1) {
            newWallet =
              neoXIndex === 0 ? this.neoXWalletArr[1] : this.neoXWalletArr[0];
          } else {
            if (this.neo3WalletArr.length > 0) {
              newWallet = this.neo3WalletArr[0];
            } else if (this.neo2WalletArr.length > 0) {
              newWallet = this.neo2WalletArr[0];
            }
          }
          break;
      }
    }
    this.store.dispatch({
      type:
        deleteChainType === 'Neo2'
          ? REMOVE_NEO2_WALLET
          : deleteChainType === 'Neo3'
          ? REMOVE_NEO3_WALLET
          : REMOVE_NEOX_WALLET,
      data: deleteWallet,
    });
    this.chrome.removeConnectWebsiteOfAddress(
      deleteWallet.accounts[0].address,
      deleteChainType,
      newWallet?.accounts[0].address
    );
    if (newWallet) {
      this.store.dispatch({ type: UPDATE_WALLET, data: newWallet });
      if (!ethers.isAddress(newWallet.accounts[0].address)) {
        this.chrome.accountChangeEvent(newWallet);
      }
      return of(newWallet);
    }
    return of(deleteWallet);
  }
  //#endregion

  //#region import wallet
  /**
   * Create a new wallet include given private key and encrypt by given password.
   * 创建包含指定私钥的新钱包，并进行加密
   * @param privKey private key to import
   * @param key encrypt password for new address
   */
  public importPrivateKey(
    privKey: string,
    key: string,
    name: string = null
  ): Observable<Wallet2 | Wallet3> {
    if (this.selectChainState.selectedChainType === 'Neo2') {
      const account = new wallet2.Account(privKey);
      const w = Neon2.create.wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      const wif = w.accounts[0].WIF;
      w.encrypt(0, key);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    } else if (this.selectChainState.selectedChainType === 'Neo3') {
      const account = new wallet3.Account(privKey);
      const w = new Wallet3({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      const wif = w.accounts[0].WIF;
      w.encrypt(0, key);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    }
  }
  /**
   * Create a new wallet include given private key and encrypt by given password.
   * 创建包含指定私钥的新钱包，并进行加密
   * @param privKey private key to import
   * @param key encrypt password for new address
   */
  public importWIF(
    wif: string,
    key: string,
    name: string = null
  ): Observable<Wallet2 | Wallet3> {
    if (this.selectChainState.selectedChainType === 'Neo2') {
      const account = new wallet2.Account(wallet2.getPrivateKeyFromWIF(wif));
      const w = Neon2.create.wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      w.encrypt(0, key);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    } else if (this.selectChainState.selectedChainType === 'Neo3') {
      const account = new wallet3.Account(wallet3.getPrivateKeyFromWIF(wif));
      const w = new Wallet3({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      w.encrypt(0, key);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    }
  }
  public async importEncryptKey(
    encKey: string,
    oldPwd: string,
    name: string,
    newPwd: string
  ) {
    if (this.selectChainState.selectedChainType === 'Neo2') {
      try {
        const wif = await wallet2.decrypt(encKey, oldPwd);
        const account = new wallet2.Account(wallet2.getPrivateKeyFromWIF(wif));
        account.label = name;
        const newWallet = new wallet2.Wallet({
          name: name || 'NeoLineUser',
        } as any);
        newWallet.addAccount(account);
        await newWallet.accounts[0].encrypt(newPwd);
        return newWallet;
      } catch (error) {
        return 'Wrong password';
      }
    } else if (this.selectChainState.selectedChainType === 'Neo3') {
      try {
        const wif = await wallet3.decrypt(encKey, oldPwd);
        const account = new Account3(wallet3.getPrivateKeyFromWIF(wif));
        account.label = name;
        const newWallet = new Wallet3({
          name: name || 'NeoLineUser',
        } as any);
        newWallet.addAccount(account);
        await newWallet.accounts[0].encrypt(newPwd);
        return newWallet;
      } catch (error) {
        return 'Wrong password';
      }
    }
  }
  //#endregion
}
