import { Component, OnInit } from '@angular/core';
import { Router, RouterEvent, NavigationEnd } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from 'src/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork } from '@/app/popup/_lib';
import { NeonService } from '@/app/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit {
  private currentUrl = this.router.url;
  showNetworkList = false;

  private accountSub: Unsubscribable;
  address: string;
  currentChainType: ChainType;
  n2Network: RpcNetwork;
  n3Network: RpcNetwork;
  neoXNetwork: RpcNetwork;

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private neon: NeonService
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      if (state.currentWallet) {
        this.address = state.currentWallet.accounts[0].address;
      }
      this.currentChainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
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

  getNetworkName() {
    if (!this.address) {
      switch (this.neon.selectedChainType) {
        case 'Neo2':
          return this.n2Network.name;
        case 'Neo3':
          return this.n3Network.name;
        case 'NeoX':
          return this.neoXNetwork.name;
      }
    }
    switch (this.currentChainType) {
      case 'Neo2':
        return this.n2Network.name;
      case 'Neo3':
        return this.n3Network.name;
      case 'NeoX':
        return this.neoXNetwork.name;
    }
  }
}
