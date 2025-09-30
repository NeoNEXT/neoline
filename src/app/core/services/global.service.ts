import { Injectable, isDevMode } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from './notification.service';
import { add, subtract, bignumber } from 'mathjs';
import { HttpErrorResponse } from '@angular/common/http';
import * as Sentry from '@sentry/angular';
import { MatDialog } from '@angular/material/dialog';
import { ChromeService } from './chrome.service';
import { Router } from '@angular/router';
import { ChainType, RpcNetwork } from '@/app/popup/_lib';
import { NEO, GAS } from '@/models/models';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { ethers } from 'ethers';
import { PopupAddNetworkDialogComponent } from '@/app/popup/_dialogs';

@Injectable()
export class GlobalService {
  constructor(
    private snackBar: MatSnackBar,
    private notification: NotificationService,
    private chrome: ChromeService,
    private router: Router,
    private dialog: MatDialog
  ) {}

  public log(...params: any[]) {
    if (isDevMode()) {
      console.log(...params);
    }
  }

  public snackBarTip(msg: string, serverError: any = '', time = 3000) {
    Sentry.captureException({ msg, serverError });
    let message = this.notification.content[msg] || msg;
    if (serverError instanceof HttpErrorResponse) {
      serverError = serverError.statusText;
    } else if (typeof serverError !== 'string') {
      serverError = '';
    }
    if (serverError !== '') {
      message = message + ': ' + serverError;
    }
    message = message.length > 260 ? message.slice(0, 260) + '...' : message;
    this.snackBar.open(message, this.notification.content.close, {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: time,
    });
  }

  public mathAdd(a: number, b: number): number {
    return parseFloat(add(bignumber(a), bignumber(b)).toString());
  }
  public mathSub(a: number, b: number): number {
    return parseFloat(subtract(bignumber(a), bignumber(b)).toString());
  }

  async getWIF(
    WIFArr: string[],
    walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>,
    currentWallet: Wallet2 | Wallet3 | EvmWalletJSON
  ): Promise<string> {
    const index = walletArr.findIndex(
      (item) => item.accounts[0].address === currentWallet.accounts[0].address
    );
    const wif = WIFArr[index];
    if (wif) {
      return wif;
    }
    if (currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      return '';
    }
    const pwd = await this.chrome.getPassword();
    if (ethers.isAddress(currentWallet.accounts[0].address)) {
      return ethers.Wallet.fromEncryptedJson(
        JSON.stringify(currentWallet),
        pwd
      ).then((wallet) => {
        return wallet.privateKey;
      });
    }
    return (currentWallet.accounts[0] as any).decrypt(pwd).then((res) => {
      return res.WIF;
    });
  }

  toExplorer({
    chain,
    network,
    networkIndex,
    type,
    value,
  }: {
    chain: ChainType;
    network: RpcNetwork;
    networkIndex: number;
    type: 'account' | 'token' | 'NFT' | 'tx';
    value: string;
  }) {
    let openEditDialog = false;
    const explorer = network?.explorer.endsWith('/')
      ? network.explorer.slice(0, -1)
      : network.explorer;
    switch (chain) {
      case 'Neo2':
        if (explorer) {
          if (type === 'account') {
            window.open(`${explorer}/address/${value}/page/1`);
          } else if (type === 'tx') {
            window.open(`${explorer}/transaction/${value}`);
          } else if (type === 'token') {
            const isNep5 = value !== NEO && value !== GAS;
            window.open(
              `${explorer}/${isNep5 ? 'nep5' : 'asset'}/${value}/page/1`
            );
          }
        }
        break;
      case 'Neo3':
        if (explorer) {
          if (type === 'account') {
            window.open(`${explorer}/address/${value}`);
          } else if (type === 'tx') {
            window.open(`${explorer}/transaction/${value}`);
          } else if (type === 'token') {
            window.open(`${explorer}/tokens/nep17/${value}`);
          } else if (type === 'NFT') {
            window.open(`${explorer}/tokens/nft/${value}`);
          }
        } else {
          openEditDialog = true;
        }
        break;
      case 'NeoX':
        if (explorer) {
          if (type === 'account') {
            window.open(`${explorer}/address/${value}`);
          } else if (type === 'tx') {
            window.open(`${explorer}/tx/${value}`);
          } else if (type === 'token' || type === 'NFT') {
            window.open(`${explorer}/token/${value}`);
          }
        } else {
          openEditDialog = true;
        }
        break;
    }
    if (openEditDialog) {
      this.dialog.open(PopupAddNetworkDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          addChainType: chain,
          index: networkIndex,
          editNetwork: network,
          addExplorer: true,
        },
      });
    }
  }

  checkNeedRedirectHome() {
    const noNeedRedirectUrl = [
      '/popup/about',
      '/popup/setting',
      '/popup/wallet',
      '/popup/account',
      '/popup/address-book',
      '/popup/transfer/receive',
      '/popup/one-password',
    ];
    if (
      noNeedRedirectUrl.findIndex((item) => location.hash.includes(item)) < 0
    ) {
      this.router.navigateByUrl('/popup/home');
    }
  }
}
