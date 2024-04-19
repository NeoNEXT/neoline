import { Component, OnInit } from '@angular/core';
import { Router, RouterEvent, NavigationEnd } from '@angular/router';
import { RpcNetwork } from './_lib';
import { Store } from '@ngrx/store';
import { AppState } from 'src/app/reduers';
import { Unsubscribable } from 'rxjs';

@Component({
  templateUrl: 'popup.component.html',
  styleUrls: ['popup.component.scss'],
})
export class PopupComponent implements OnInit {
  private currentUrl = this.router.url;
  showNetworkList = false;
  showAvatarMenu = false;

  private accountSub: Unsubscribable;
  address: string;
  currentNetwork: RpcNetwork;
  constructor(private store: Store<AppState>, private router: Router) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      if (state.currentWallet) {
        this.address = state.currentWallet.accounts[0].address;
      }
      switch (state.currentChainType) {
        case 'Neo2':
          this.currentNetwork = state.n2Networks[state.n2NetworkIndex];
          break;
        case 'Neo3':
          this.currentNetwork = state.n3Networks[state.n3NetworkIndex];
          break;
        case 'NeoX':
          this.currentNetwork = state.neoXNetworks[state.neoXNetworkIndex];
          break;
      }
    });
  }

  ngOnInit(): void {
    this.router.events.subscribe((res: RouterEvent) => {
      if (res instanceof NavigationEnd) {
        this.currentUrl = res.url;
      }
    });
  }

  checkIsThemeBg() {
    if (this.currentUrl.indexOf('/wallet/new-guide') >= 0) {
      return true;
    }
    return false;
  }

  getShowAvatar() {
    if (
      !this.address ||
      this.currentUrl.indexOf('/login') >= 0 ||
      this.currentUrl.indexOf('/wallet/new-guide') >= 0 ||
      this.router.url.indexOf('/notification') >= 0
    ) {
      return false;
    }
    return true;
  }
}
