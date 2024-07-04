import { Component, Input, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';
import { STORAGE_NAME } from '../../_lib';
import { MatDialog } from '@angular/material/dialog';
import { PopupAuthorizationListDialogComponent } from '../../_dialogs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { EvmWalletJSON } from '../../_lib/evm';
import { ethers } from 'ethers';
declare var chrome: any;

@Component({
  selector: 'home-dapp-auth',
  templateUrl: 'dapp-auth.component.html',
  styleUrls: ['dapp-auth.component.scss'],
})
export class PopupHomeDappAuthComponent implements OnInit {
  @Input() currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  @Input() allWallet: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
  hostname: string;
  favIconUrl = '/assets/images/common/dapp-auth.svg';
  hostTitle: string;
  authWalletList: Array<Wallet2 | Wallet3 | EvmWalletJSON> = [];

  private allWebsites;

  constructor(
    private chromeService: ChromeService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
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
            ethers.isAddress(address) &&
            allWebsites[address].some(
              (item) =>
                item.status === 'true' && item.hostname === this.hostname
            )
          ) {
            walletList.push(wallet);
            addressList.push(address);
          }
        });

        this.authWalletList = walletList;
      });
  }
}
