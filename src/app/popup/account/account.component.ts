import { Component, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import {
  PopupQRCodeDialogComponent,
  PopupPrivateKeyComponent,
  PopupConfirmDialogComponent,
} from '@popup/_dialogs';

import { GlobalService, ChromeService, NeonService } from '@app/core';
import { wallet } from '@cityofzion/neon-core';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import {
  ChainType,
  RpcNetwork,
  UPDATE_WALLET,
  UPDATE_NEO2_WALLET_NAME,
  UPDATE_NEO3_WALLET_NAME,
  UPDATE_NEOX_WALLET_NAME,
} from '../_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { ActivatedRoute, Router } from '@angular/router';
import { EvmWalletJSON } from '../_lib/evm';

@Component({
  templateUrl: 'account.component.html',
  styleUrls: ['account.component.scss'],
})
export class PopupAccountComponent implements OnDestroy {
  @ViewChild('inputDom') inputDom: ElementRef;
  publicKey: string;
  isLedger = false;
  showEditName = false;
  inputName = '';

  showRemoveBtn = false;
  showMnemonicBtn = false;

  operateWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  operateChainType: ChainType;

  private accountSub: Unsubscribable;
  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  private currentChainType: ChainType;
  private neo2WIFArr: string[];
  private neo3WIFArr: string[];
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  private neoXWalletArr: EvmWalletJSON[];
  private neo2Network: RpcNetwork;
  private neo3Network: RpcNetwork;
  private neoXNetwork: RpcNetwork;
  constructor(
    private global: GlobalService,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private neon: NeonService,
    private router: Router,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.currentChainType = state.currentChainType;
      this.neo2Network = state.n2Networks[state.n2NetworkIndex];
      this.neo3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neo2WIFArr = state.neo2WIFArr;
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
      this.initData();
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  async initData() {
    this.aRouter.queryParams.subscribe(async (params) => {
      const address = params.address;
      if (address && params.chainType) {
        this.operateChainType = params.chainType;
        switch (this.operateChainType) {
          case 'Neo2':
            this.operateWallet = this.neo2WalletArr.find(
              (item) => item.accounts[0].address === address
            );
            break;
          case 'Neo3':
            this.operateWallet = this.neo3WalletArr.find(
              (item) => item.accounts[0].address === address
            );
            break;
          case 'NeoX':
            this.operateWallet = this.neoXWalletArr.find(
              (item) => item.accounts[0].address === address
            );
            break;
        }
      } else {
        this.operateWallet = this.currentWallet;
        this.operateChainType = this.currentChainType;
      }
      this.inputName = this.operateWallet.name;
      this.isLedger = !!this.operateWallet.accounts[0]?.extra?.ledgerSLIP44;
      // show remove button
      if (this.isLedger) {
        this.showRemoveBtn = true;
      } else {
        const neo2Wallet = this.neo2WalletArr.filter(
          (item) => !item.accounts[0]?.extra?.ledgerSLIP44
        );
        const neo3Wallet = this.neo3WalletArr.filter(
          (item) => !item.accounts[0]?.extra?.ledgerSLIP44
        );
        const neoXWallet = this.neoXWalletArr.filter(
          (item) => !item.accounts[0]?.extra?.ledgerSLIP44
        );
        if (neo2Wallet.length + neo3Wallet.length + neoXWallet.length > 1) {
          this.showRemoveBtn = true;
        } else {
          this.showRemoveBtn = false;
        }
      }
      // show mnemonic button
      this.showMnemonicBtn = this.operateWallet.accounts[0]?.extra?.isHDWallet
        ? true
        : false;
      await this.getPublicKey();
    });
  }

  public wif(showMnemonic = false) {
    return this.dialog.open(PopupPrivateKeyComponent, {
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
      data: {
        currentWallet: this.operateWallet,
        chainType: this.operateChainType,
        showMnemonic,
      },
    });
  }

  public qrcode() {
    return this.dialog.open(PopupQRCodeDialogComponent, {
      width: 'auto',
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
      data: this.operateWallet.accounts[0].address,
    });
  }

  editName() {
    this.showEditName = true;
    setTimeout(() => {
      this.inputDom.nativeElement.focus();
    }, 100);
  }

  updateName() {
    if (
      this.inputName.trim() === '' ||
      this.operateWallet.name === this.inputName
    ) {
      this.showEditName = false;
      return;
    }
    this.operateWallet.name = this.inputName;
    if (
      this.currentWallet.accounts[0].address ===
      this.operateWallet.accounts[0].address
    ) {
      this.store.dispatch({ type: UPDATE_WALLET, data: this.operateWallet });
    }
    const data = {
      address: this.operateWallet.accounts[0].address,
      name: this.inputName,
    };
    switch (this.operateChainType) {
      case 'Neo2':
        this.store.dispatch({
          type: UPDATE_NEO2_WALLET_NAME,
          data,
        });
        this.chrome.accountChangeEvent(
          (this.operateWallet as Wallet2).export()
        );
        break;
      case 'Neo3':
        this.store.dispatch({
          type: UPDATE_NEO3_WALLET_NAME,
          data,
        });
        this.chrome.accountChangeEvent(
          (this.operateWallet as Wallet3).export()
        );
        break;
      case 'NeoX':
        this.store.dispatch({
          type: UPDATE_NEOX_WALLET_NAME,
          data,
        });
        this.chrome.accountChangeEvent(this.operateWallet as EvmWalletJSON);
        break;
    }
    this.showEditName = false;
    this.global.snackBarTip('nameModifySucc');
  }

  private async getPublicKey() {
    if (this.isLedger || this.operateChainType === 'NeoX') {
      this.publicKey = this.operateWallet.accounts[0]?.extra?.publicKey;
      return;
    }
    const currentWIFArr =
      this.operateChainType === 'Neo2' ? this.neo2WIFArr : this.neo3WIFArr;
    const currentWalletArr =
      this.operateChainType === 'Neo2'
        ? this.neo2WalletArr
        : this.neo3WalletArr;
    const index = currentWalletArr.findIndex(
      (item) =>
        item.accounts[0].address === this.operateWallet.accounts[0].address
    );
    const wif = currentWIFArr[index];
    if (wif) {
      const walletThis = this.operateChainType === 'Neo2' ? wallet : wallet3;
      const privateKey = walletThis.getPrivateKeyFromWIF(wif);
      this.publicKey = walletThis.getPublicKeyFromPrivateKey(privateKey);
      return;
    }
    const pwd = await this.chrome.getPassword();
    (this.operateWallet.accounts[0] as any).decrypt(pwd).then((res) => {
      this.publicKey = res.publicKey;
    });
  }

  removeAccount() {
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'delWalletConfirm',
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          this.neon
            .delWallet(
              this.operateWallet,
              this.operateChainType,
              this.operateWallet.accounts[0].address ===
                this.currentWallet.accounts[0].address
            )
            .subscribe((w) => {
              if (!w) {
                this.router.navigateByUrl('/popup/wallet/new-guide');
              } else {
                this.router.navigateByUrl('/popup/home');
              }
            });
        }
      });
  }
}
