import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterEvent, NavigationEnd } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from 'src/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork, STORAGE_NAME } from '@/app/popup/_lib';
import {
  ChromeService,
  NeonService,
  SettingState,
  UtilServiceState,
} from '@/app/core';
import { LOCAL_NOTICE } from '@/app/popup/_lib/setting';

declare var chrome: any;
@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentUrl = this.router.url;
  showMenu = false;
  showExpandView = true;
  lang: string;
  settingStateSub: Unsubscribable;
  hasUnreadNotice = false;

  private accountSub: Unsubscribable;
  address: string;
  currentChainType: ChainType;
  n2Network: RpcNetwork;
  n3Network: RpcNetwork;
  n3NetworkIndex: number;
  neoXNetwork: RpcNetwork;
  neoXNetworkIndex: number;

  constructor(
    private store: Store<AppState>,
    private router: Router,
    private neon: NeonService,
    private util: UtilServiceState,
    private chromeSrc: ChromeService,
    private settingState: SettingState
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      if (state.currentWallet) {
        this.address = state.currentWallet.accounts[0].address;
      }
      this.currentChainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.n3NetworkIndex = state.n3NetworkIndex;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neoXNetworkIndex = state.neoXNetworkIndex;
    });
  }

  ngOnInit(): void {
    this.router.events.subscribe((res: RouterEvent) => {
      if (res instanceof NavigationEnd) {
        this.currentUrl = res.url;
      }
    });
    this.settingStateSub = this.settingState.langSub.subscribe((lang) => {
      this.lang = lang;
    });
    this.chromeSrc
      .getStorage(STORAGE_NAME.noticeLatestId)
      .subscribe((noticeLatestId) => {
        if (noticeLatestId !== LOCAL_NOTICE[0].id) {
          this.hasUnreadNotice = true;
        }
      });

    if (chrome.tabs) {
      chrome.tabs.getCurrent((tab) => {
        if (tab) {
          this.showExpandView = false;
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
    this.settingStateSub?.unsubscribe();
  }

  checkIsThemeBg() {
    if (this.currentUrl.indexOf('/wallet/new-guide') >= 0) {
      return true;
    }
    return false;
  }

  getShowMenu() {
    if (
      !this.address ||
      this.currentUrl.indexOf('/login') >= 0 ||
      this.currentUrl.indexOf('/wallet/new-guide') >= 0 ||
      this.currentUrl.indexOf('/notification') >= 0
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

  toWeb() {
    this.showMenu = false;
    let network: RpcNetwork;
    let networkIndex: number;
    switch (this.currentChainType) {
      case 'Neo2':
        network = this.n2Network;
        break;
      case 'Neo3':
        network = this.n3Network;
        networkIndex = this.n3NetworkIndex;
        break;
      case 'NeoX':
        network = this.neoXNetwork;
        networkIndex = this.neoXNetworkIndex;
        break;
    }
    this.util.toExplorer({
      chain: this.currentChainType,
      network,
      networkIndex,
      type: 'account',
      value: this.address,
    });
  }

  lock() {
    this.chromeSrc.setPassword('');
    this.router.navigateByUrl('/popup/login');
  }

  toHome() {
    if (this.currentUrl === '/ledger') {
      this.router.navigateByUrl('/popup/home');
    }
  }

  toNotice() {
    this.hasUnreadNotice = false;
    this.chromeSrc.setStorage(STORAGE_NAME.noticeLatestId, LOCAL_NOTICE[0].id);
    this.router.navigateByUrl('/popup/notice');
  }

  toHelpWebsite() {
    if (this.lang !== 'en') {
      window.open('https://tutorial.neoline.io/v/cn');
    } else {
      window.open('https://tutorial.neoline.io/');
    }
  }

  toNetworkList() {
    this.router.navigateByUrl('/popup/network-list');
  }

  expandView() {
    if (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.id === 'string'
    ) {
      const extensionUrl = chrome.runtime.getURL('/index.html');
      const ledgerUrl = extensionUrl + '#/popup/home';
      chrome.tabs.create({ url: ledgerUrl });
    }
  }
}
