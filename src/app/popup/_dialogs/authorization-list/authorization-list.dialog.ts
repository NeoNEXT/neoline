import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ChromeService } from '@/app/core';
import { PopupConfirmDialogComponent } from '../confirm/confirm.dialog';
import { STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: 'authorization-list.dialog.html',
  styleUrls: ['authorization-list.dialog.scss'],
})
export class PopupAuthorizationListDialogComponent implements OnInit {
  public authorizationList = [];

  private accountSub: Unsubscribable;
  private currentWallet: Wallet2 | Wallet3;
  constructor(
    private chrome: ChromeService,
    private dialog: MatDialog,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
    });
  }

  ngOnInit() {
    this.chrome.getStorage(STORAGE_NAME.connectedWebsites).subscribe((res) => {
      if (res[this.currentWallet.accounts[0].address] === undefined) {
        res[this.currentWallet.accounts[0].address] = [];
      }
      this.chrome.setStorage(STORAGE_NAME.connectedWebsites, res);
      this.authorizationList = res[this.currentWallet.accounts[0].address];
    });
  }

  public delItem(hostname: string) {
    const index = this.authorizationList.findIndex(
      (item) => item.hostname === hostname
    );
    this.authorizationList.splice(index, 1);
    this.chrome.getStorage(STORAGE_NAME.connectedWebsites).subscribe((res) => {
      res[this.currentWallet.accounts[0].address] = this.authorizationList;
      this.chrome.setStorage(STORAGE_NAME.connectedWebsites, res);
    });
  }

  public delAll() {
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'delAllAuthListConfirm',
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          this.authorizationList = [];
          this.chrome
            .getStorage(STORAGE_NAME.connectedWebsites)
            .subscribe((res) => {
              res[this.currentWallet.accounts[0].address] = [];
              this.chrome.setStorage(STORAGE_NAME.connectedWebsites, res);
            });
        }
      });
  }
}
