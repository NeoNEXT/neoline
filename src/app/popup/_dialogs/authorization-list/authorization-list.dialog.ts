import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ChromeService } from '@/app/core';
import { STORAGE_NAME, UPDATE_WALLET } from '../../_lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { EvmWalletJSON } from '../../_lib/evm';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';

@Component({
  templateUrl: 'authorization-list.dialog.html',
  styleUrls: ['authorization-list.dialog.scss'],
})
export class PopupAuthorizationListDialogComponent {
  @ViewChild('moreModalDom') moreModalDom: ElementRef;
  moreModalWallet: Wallet2 | Wallet3 | EvmWalletJSON;

  currentAddress: string;
  currentWalletIsConnected = false;
  showPermissions = false;

  constructor(
    private chrome: ChromeService,
    private store: Store<AppState>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      hostname: string;
      favIconUrl: string;
      hostTitle: string;
      authWalletList: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
      currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
      allWebsites;
    }
  ) {
    this.currentAddress = this.data.currentWallet.accounts[0].address;
    if (
      this.data.authWalletList.find(
        (item) => item.accounts[0].address === this.currentAddress
      )
    ) {
      this.currentWalletIsConnected = true;
    }
  }

  openMoreModal(e: Event, item: Wallet2 | Wallet3 | EvmWalletJSON) {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    let top = rect.top + 30;
    if (top > 420) {
      top -= 90;
    }
    this.moreModalDom.nativeElement.style.top = top + 'px';
    this.moreModalDom.nativeElement.style.bottom = 'auto';
    this.moreModalWallet = item;
  }

  disconnectAddress() {
    const address = this.moreModalWallet.accounts[0].address;
    this.moreModalWallet = undefined;
    this.data.authWalletList = this.data.authWalletList.filter(
      (item) => item.accounts[0].address !== address
    );
    if (this.data.allWebsites[address]) {
      this.data.allWebsites[address] = this.data.allWebsites[address].filter(
        (item) => item.hostname !== this.data.hostname
      );
      this.chrome.setStorage(
        STORAGE_NAME.connectedWebsites,
        this.data.allWebsites
      );
    }
  }

  async switchThisAccount(w: Wallet2 | Wallet3 | EvmWalletJSON) {
    this.data.currentWallet = w;
    this.currentAddress = this.data.currentWallet.accounts[0].address;
    this.currentWalletIsConnected = true;
    this.store.dispatch({ type: UPDATE_WALLET, data: w });
    this.chrome.accountChangeEvent(w);
  }

  connectCurrentWallet() {
    if (!this.data.allWebsites) {
      this.data.allWebsites = {};
      if (!this.data.allWebsites[this.currentAddress]) {
        this.data.allWebsites[this.currentAddress] = [];
      }
    }
    this.data.allWebsites[this.currentAddress].push({
      hostname: this.data.hostname,
      icon: this.data.favIconUrl,
      title: this.data.hostTitle,
      keep: false,
      status: 'true',
    });
    this.chrome.setStorage(
      STORAGE_NAME.connectedWebsites,
      this.data.allWebsites
    );
    this.currentWalletIsConnected = true;
    this.data.authWalletList.unshift(this.data.currentWallet);
  }
}
