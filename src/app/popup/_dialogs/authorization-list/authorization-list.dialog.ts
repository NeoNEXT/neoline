import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ChromeService } from '@/app/core';
import {
  ChainType,
  ConnectedWebsitesType,
  STORAGE_NAME,
  UPDATE_WALLET,
} from '../../_lib';
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
      allWebsites: ConnectedWebsitesType;
      chainType: ChainType;
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
    this.moreModalDom.nativeElement.style.top = top + 'px';
    this.moreModalDom.nativeElement.style.bottom = 'auto';
    this.moreModalWallet = item;
  }

  disconnectAddress() {
    const address = this.moreModalWallet.accounts[0].address;
    this.moreModalWallet = undefined;
    if (this.currentAddress === address) {
      this.currentWalletIsConnected = false;
    }
    const index = this.data.authWalletList.findIndex(
      (item) => item.accounts[0].address === address
    );
    this.data.authWalletList.splice(index, 1);
    delete this.data.allWebsites[this.data.hostname].connectedAddress[address];
    this.chrome.setStorage(
      STORAGE_NAME.connectedWebsites,
      this.data.allWebsites
    );
    this.chrome.evmAccountChange(this.getConnectedAddress());
  }

  getConnectedAddress() {
    const addresses = this.data.authWalletList.reduce((prev, item) => {
      prev.push(item.accounts[0].address);
      return prev;
    }, []);
    const index = addresses.indexOf(this.currentAddress);
    if (index >= 0) {
      addresses.splice(index, 1);
      addresses.unshift(this.currentAddress);
    }
    return addresses;
  }

  async switchThisAccount(w: Wallet2 | Wallet3 | EvmWalletJSON) {
    this.data.currentWallet = w;
    this.currentAddress = this.data.currentWallet.accounts[0].address;
    this.currentWalletIsConnected = true;
    this.store.dispatch({ type: UPDATE_WALLET, data: w });
    this.chrome.accountChangeEvent(w);
  }

  connectCurrentWallet() {
    if (!this.data.allWebsites[this.data.hostname]) {
      this.data.allWebsites[this.data.hostname] = {
        icon: this.data.favIconUrl,
        title: this.data.hostTitle,
        connectedAddress: {
          [this.currentAddress]: {
            keep: false,
            chain: this.data.chainType,
          },
        },
      };
    } else {
      this.data.allWebsites[this.data.hostname].connectedAddress[
        this.currentAddress
      ] = {
        keep: false,
        chain: this.data.chainType,
      };
    }
    this.chrome.setStorage(
      STORAGE_NAME.connectedWebsites,
      this.data.allWebsites
    );
    this.currentWalletIsConnected = true;
    this.data.authWalletList.unshift(this.data.currentWallet);
    this.chrome.evmAccountChange(this.getConnectedAddress());
  }
}
