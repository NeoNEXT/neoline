import { Component, OnInit } from '@angular/core';
import { Router, RouterEvent, NavigationEnd } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import {
  PopupHomeMenuDialogComponent,
  PopupN3NetworkDialogComponent,
} from './_dialogs';
import { RpcNetwork } from './_lib';
import { Store } from '@ngrx/store';
import { AppState } from 'src/app/reduers';
import { Unsubscribable } from 'rxjs';

@Component({
  templateUrl: 'popup.component.html',
  styleUrls: ['popup.component.scss'],
})
export class PopupComponent implements OnInit {
  private isThirdParty: boolean = false;
  private isNotificationComfirm: boolean = false;
  private currentUrl = this.router.url;

  private accountSub: Unsubscribable;
  public address: string;
  public currentNetwork: RpcNetwork;
  constructor(
    private store: Store<AppState>,
    private router: Router,
    private dialog: MatDialog
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      if (state.currentWallet) {
        const wallet = state.currentWallet;
        this.address = wallet.accounts[0].address;
      }
      const chainType = state.currentChainType;
      const networks =
        chainType === 'Neo2' ? state.n2Networks : state.n3Networks;
      const selectedNetworkIndex =
        chainType === 'Neo2' ? state.n2NetworkIndex : state.n3NetworkIndex;
      this.currentNetwork = networks[selectedNetworkIndex];
    });
  }

  ngOnInit(): void {
    if (this.router.url.indexOf('/notification') >= 0) {
      this.isThirdParty = true;
      if (
        this.router.url.indexOf('/deploy') >= 0 ||
        this.router.url.indexOf('/invoke') >= 0 ||
        this.router.url.indexOf('/invoke-multi') >= 0 ||
        this.router.url.indexOf('/transfer') >= 0 ||
        this.router.url.indexOf('/signature') >= 0 ||
        this.router.url.indexOf('/neo3-transfer') >= 0 ||
        this.router.url.indexOf('/neo3-invoke-multi') >= 0 ||
        this.router.url.indexOf('/neo3-invoke') >= 0 ||
        this.router.url.indexOf('/neo3-signature') >= 0 ||
        this.router.url.indexOf('/neo3-sign-transaction') >= 0
      ) {
        this.isNotificationComfirm = true;
      }
    }
    this.router.events.subscribe((res: RouterEvent) => {
      if (res instanceof NavigationEnd) {
        if (res.url.indexOf('/notification') >= 0) {
          this.isThirdParty = true;
        }
        this.currentUrl = res.url;
      }
    });
  }

  getShowAvatar() {
    if (
      !this.address ||
      this.currentUrl.indexOf('/login') >= 0 ||
      this.currentUrl.indexOf('/wallet/new-guide') >= 0
    ) {
      return false;
    }
    return true;
  }

  public topMenu() {
    this.dialog.open(PopupHomeMenuDialogComponent, {
      position: {
        top: '48px',
        right: '0px',
        left: '0px',
        bottom: '0px',
      },
      autoFocus: false,
      width: '375px',
      maxWidth: 375,
      // maxHeight: 500,
    });
  }

  openNetwork() {
    this.dialog.open(PopupN3NetworkDialogComponent, {
      position: {
        top: '65px',
        right: '10px',
      },
      autoFocus: false,
      width: '315px',
      maxWidth: 375,
      maxHeight: 500,
    });
  }
}
