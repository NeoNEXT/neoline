import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ChainType, ConnectedWebsitesType, STORAGE_NAME } from '../../_lib';
import { MatDialog } from '@angular/material/dialog';
import { PopupAuthorizationListDialogComponent } from '../../_dialogs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '../../_lib/evm';
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

  currentWalletIsConnected = false;
  private allWebsites;

  constructor(
    private chromeService: ChromeService,
    private dialog: MatDialog
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes.chainType &&
        changes.chainType.previousValue !== changes.chainType.currentValue) ||
      (changes.currentWallet &&
        changes.currentWallet.previousValue !==
          changes.currentWallet.currentValue)
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
    } else {
      this.favIconUrl = '';
      this.hostTitle = document.title;
      this.hostname = location.hostname;
      // this.getDappAuthList();
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
          chainType: this.chainType,
        },
      })
      .afterClosed()
      .subscribe(() => {
        this.getDappAuthList();
      });
  }

  private getDappAuthList() {
    this.currentWalletIsConnected = false;
    if (!this.hostname) return;
    this.chromeService
      .getStorage(STORAGE_NAME.connectedWebsites)
      .subscribe((allWebsites: ConnectedWebsitesType) => {
        this.allWebsites = allWebsites;
        let walletList = [];
        let addressList = [];
        Object.keys(
          allWebsites?.[this.hostname]?.connectedAddress || {}
        ).forEach((address) => {
          if (address === this.currentWallet.accounts[0].address) {
            this.currentWalletIsConnected = true;
          }
          const item = allWebsites[this.hostname].connectedAddress[address];
          if (item.chain === this.chainType) {
            const tempWallet = this.allWallet.find(
              (wallet) => wallet.accounts[0].address === address
            );
            if (tempWallet) {
              walletList.push(tempWallet);
              addressList.push(address);
            }
          }
        });
        this.authWalletList = walletList;
      });
  }
}
