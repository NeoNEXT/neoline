import { Component, OnInit } from '@angular/core';
import { Router, RouterEvent, NavigationEnd } from '@angular/router';
import { RpcNetwork, ChainType } from './_lib';
import { Store } from '@ngrx/store';
import { AppState } from 'src/app/reduers';
import { Unsubscribable } from 'rxjs';

@Component({
  templateUrl: 'popup.component.html',
  styleUrls: ['popup.component.scss'],
})
export class PopupComponent implements OnInit {
  private currentUrl = this.router.url;
  headerIsThemeBg = false;
  isThirdParty = false;
  showNetworkList = false;
  showAvatarMenu = false;

  private accountSub: Unsubscribable;
  address: string;
  networks: RpcNetwork[];
  networkIndex: number;
  chainType: ChainType;
  constructor(private store: Store<AppState>, private router: Router) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      if (state.currentWallet) {
        const wallet = state.currentWallet;
        this.address = wallet.accounts[0].address;
      }
      this.chainType = state.currentChainType;
      this.networks =
        this.chainType === 'Neo2' ? state.n2Networks : state.n3Networks;
      this.networkIndex =
        this.chainType === 'Neo2' ? state.n2NetworkIndex : state.n3NetworkIndex;
    });
  }

  ngOnInit(): void {
    if (
      this.router.url.indexOf('popup/wallet/new-guide') >= 0 ||
      this.router.url.indexOf('popup/login') >= 0
    ) {
      this.headerIsThemeBg = true;
    }
    if (this.router.url.indexOf('/notification') >= 0) {
      this.isThirdParty = true;
    }
    this.router.events.subscribe((res: RouterEvent) => {
      if (res instanceof NavigationEnd) {
        if (
          res.url.indexOf('popup/wallet/new-guide') >= 0 ||
          res.url.indexOf('popup/login') >= 0
        ) {
          this.headerIsThemeBg = true;
        } else {
          this.headerIsThemeBg = false;
        }
        if (this.router.url.indexOf('/notification') >= 0) {
          this.isThirdParty = true;
        } else {
          this.isThirdParty = false;
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
}
