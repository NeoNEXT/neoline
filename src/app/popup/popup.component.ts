import { Component, OnInit } from '@angular/core';
import { Router, RouterEvent, NavigationEnd } from '@angular/router';
import { RpcNetwork, ChainType } from './_lib';
import { Store } from '@ngrx/store';
import { AppState } from 'src/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

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
  networks: RpcNetwork[];
  networkIndex: number;
  chainType: ChainType;
  switchNetwork: RpcNetwork;
  switchChainWallet: Wallet2 | Wallet3;
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
      this.switchNetwork =
        this.chainType === 'Neo2'
          ? state.n3Networks[state.n3NetworkIndex]
          : state.n2Networks[state.n2NetworkIndex];
      this.switchChainWallet =
        this.chainType === 'Neo2'
          ? state.neo3WalletArr[0]
          : state.neo2WalletArr[0];
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
