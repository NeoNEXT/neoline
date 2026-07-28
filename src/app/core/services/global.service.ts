import { Injectable, isDevMode } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from './notification.service';
import { add, subtract, bignumber } from 'mathjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { ChromeService } from './chrome.service';
import { EvmWalletService } from './evm/wallet.service';
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
    private evmWalletService: EvmWalletService,
    private router: Router,
    private dialog: MatDialog
  ) {}

  public log(...params: any[]) {
    if (isDevMode()) {
      console.log(...params);
    }
  }

  public snackBarTip(msg: string, serverError: any = '', time = 3000) {
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

  public snackBarExistWalletTip(
    wallet: Wallet2 | Wallet3 | EvmWalletJSON,
    time = 3000,
    isMnemonic = false
  ) {
    let message: string;
    if (isMnemonic) {
      // 助记词钱包组提示展示的是组标识 hdWalletId（Wallet n），而非命中账户的名称
      const hdWalletId =
        (wallet?.accounts[0]?.extra?.hdWalletId as string) ?? '';
      message = (
        this.notification.content.existingMnemonicWallet as string
      ).replace('{name}', hdWalletId);
    } else {
      const address = wallet?.accounts[0]?.address ?? '';
      const shortAddress =
        address.length > 12
          ? address.slice(0, 6) + '...' + address.slice(-6)
          : address;
      message = (this.notification.content.existingWallet as string)
        .replace('{name}', wallet?.name ?? '')
        .replace('{address}', shortAddress);
    }
    // 不使用 duration 自动关闭，改为手动计时：鼠标悬停时暂停，移出后重新计时关闭
    const snackBarRef = this.snackBar.open(
      message,
      this.notification.content.close,
      {
        horizontalPosition: 'center',
        verticalPosition: 'top',
      }
    );
    const container: HTMLElement | undefined = (
      snackBarRef.containerInstance as any
    )?._elementRef?.nativeElement;
    if (!container) {
      setTimeout(() => snackBarRef.dismiss(), time);
      return;
    }
    let timer = setTimeout(() => snackBarRef.dismiss(), time);
    container.addEventListener('mouseenter', () => clearTimeout(timer));
    container.addEventListener('mouseleave', () => {
      clearTimeout(timer);
      timer = setTimeout(() => snackBarRef.dismiss(), 1000);
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
      return this.evmWalletService.getPrivateKey(
        currentWallet as EvmWalletJSON,
        pwd
      );
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
    const explorer = network?.explorer?.endsWith('/')
      ? network.explorer.slice(0, -1)
      : network.explorer;
    if (explorer) {
      switch (chain) {
        case 'Neo2':
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
          break;
        case 'Neo3':
          if (type === 'account') {
            window.open(`${explorer}/address/${value}`);
          } else if (type === 'tx') {
            window.open(`${explorer}/transaction/${value}`);
          } else if (type === 'token') {
            window.open(`${explorer}/tokens/nep17/${value}`);
          } else if (type === 'NFT') {
            window.open(`${explorer}/tokens/nft/${value}`);
          }
          break;
        case 'NeoX':
          if (type === 'account') {
            window.open(`${explorer}/address/${value}`);
          } else if (type === 'tx') {
            window.open(`${explorer}/tx/${value}`);
          } else if (type === 'token' || type === 'NFT') {
            window.open(`${explorer}/token/${value}`);
          }
          break;
      }
    }
    if (!explorer && chain !== 'Neo2') {
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
