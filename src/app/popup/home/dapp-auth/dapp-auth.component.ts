import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ChainType, STORAGE_NAME } from '../../_lib';
import { MatDialog } from '@angular/material/dialog';
import { PopupAuthorizationListDialogComponent } from '../../_dialogs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { EvmWalletJSON } from '../../_lib/evm';
import { ethers } from 'ethers';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { wallet as wallet2 } from '@cityofzion/neon-core';
declare var chrome: any;

@Component({
  selector: 'home-dapp-auth',
  templateUrl: 'dapp-auth.component.html',
  styleUrls: ['dapp-auth.component.scss'],
})
export class PopupHomeDappAuthComponent implements OnChanges {
  @Input() currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  @Input() allWallet: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
  @Input() chainType: ChainType;
  hostname: string;
  defaultFavIconUrl = '/assets/images/common/dapp-auth.svg';
  favIconUrl: string;
  hostTitle: string;
  authWalletList: Array<Wallet2 | Wallet3 | EvmWalletJSON> = [];

  private allWebsites;

  constructor(
    private chromeService: ChromeService,
    private dialog: MatDialog
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.chainType &&
      changes.chainType.previousValue !== changes.chainType.currentValue
    ) {
      this.initData();
    }
  }

  initData() {
    if (chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].favIconUrl) {
          this.favIconUrl = tabs[0].favIconUrl;
        }
        if (tabs?.[0]?.title) {
          this.hostTitle = tabs[0].title;
        }

        if (tabs[0] && tabs[0].url) {
          const url = new URL(tabs[0].url);
          this.hostname = url.hostname;

          this.getDappAuthList();
        }
      });
    }
  }

  viewAllAuth() {
    this.dialog
      .open(PopupAuthorizationListDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          hostname: this.hostname,
          favIconUrl: this.favIconUrl,
          hostTitle: this.hostTitle,
          authWalletList: this.authWalletList,
          currentWallet: this.currentWallet,
          allWebsites: this.allWebsites,
        },
      })
      .afterClosed()
      .subscribe(() => {
        this.getDappAuthList();
      });
  }

  private getDappAuthList() {
    if (!this.hostname) return;
    this.chromeService
      .getStorage(STORAGE_NAME.connectedWebsites)
      .subscribe((allWebsites) => {
        this.allWebsites = allWebsites;
        let walletList = [];
        let addressList = [];
        Object.keys(allWebsites || {}).forEach((address: string) => {
          const wallet = this.allWallet.find(
            (item) => item.accounts[0].address === address
          );
          if (!wallet) {
            delete this.allWebsites[address];
          }
          if (
            wallet &&
            allWebsites[address].some(
              (item) =>
                item.status === 'true' && item.hostname === this.hostname
            )
          ) {
            let valid = false;
            switch (this.chainType) {
              case 'Neo2':
                valid = wallet2.isAddress(address);
                break;
              case 'Neo3':
                valid = wallet3.isAddress(address, 53);
                break;
              case 'NeoX':
                valid = ethers.isAddress(address);
                break;
            }
            if (valid) {
              walletList.push(wallet);
              addressList.push(address);
            }
          }
        });

        this.authWalletList = walletList;
      });
  }
}
