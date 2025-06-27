import { Component, OnInit } from '@angular/core';
import { SettingState } from '@/app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { Router } from '@angular/router';
import {
  ChainType,
  RpcNetwork,
  N3MainnetNetwork,
  N3TestnetNetwork,
} from '../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import {
  EvmWalletJSON,
  NeoXMainnetNetwork,
  NeoXTestnetNetwork,
} from '../_lib/evm';
import { MatDialog } from '@angular/material/dialog';

declare var chrome: any;

@Component({
  templateUrl: 'home.component.html',
  styleUrls: ['home.component.scss'],
})
export class PopupHomeComponent implements OnInit {
  selectedIndex = 0; // asset tab or transaction tab
  rateCurrency: string;
  lang = 'en';
  hideValue = false;
  totalValue = 0;
  showDappAuth = true;

  private accountSub: Unsubscribable;
  currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  address: string;
  chainType: ChainType;
  n3Network: RpcNetwork;
  n3NetworkIndex: number;
  neoXNetwork: RpcNetwork;
  neoXNetworkIndex: number;
  allWallet: Array<Wallet2 | Wallet3 | EvmWalletJSON> = [];
  constructor(
    private router: Router,
    private settingState: SettingState,
    private dialog: MatDialog,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.n3NetworkIndex = state.n3NetworkIndex;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.neoXNetworkIndex = state.neoXNetworkIndex;
      this.allWallet = (state.neo3WalletArr as any)
        .concat(state.neo2WalletArr)
        .concat(state.neoXWalletArr);
      this.selectedIndex = 0;
    });
  }

  ngOnInit(): void {
    this.settingState.langSub.subscribe((lang) => {
      this.lang = lang;
    });
    this.settingState.rateCurrencySub.subscribe((res) => {
      this.rateCurrency = res;
    });
    if (chrome.tabs) {
      chrome.tabs.getCurrent((tab) => {
        if (tab) {
          this.showDappAuth = false;
        }
      });
    }
  }

  getTotalValue(value) {
    this.totalValue = value;
  }

  showAccountList() {
    this.router.navigateByUrl('/popup/account-list');
  }

  showBridge() {
    if (
      (this.chainType === 'NeoX' &&
        (this.neoXNetwork.chainId === NeoXMainnetNetwork.chainId ||
          this.neoXNetwork.chainId === NeoXTestnetNetwork.chainId)) ||
      (this.chainType === 'Neo3' &&
        (this.n3Network.chainId === N3MainnetNetwork.chainId ||
          this.n3Network.chainId === N3TestnetNetwork.chainId))
    ) {
      return true;
    }
    return false;
  }

  toAdd() {
    if (this.chainType === 'Neo3' && this.selectedIndex === 1) {
      this.router.navigateByUrl('/popup/add-nft');
    } else if (this.chainType === 'NeoX' && this.selectedIndex === 1) {
      this.router.navigateByUrl('/popup/add-evm-nft');
    } else {
      this.router.navigateByUrl('/popup/add-asset');
    }
  }
  getSupport(type: 'asset' | 'txs' = 'asset') {
    let url: string;
    switch (type) {
      case 'asset':
        if (this.lang === 'zh_CN') {
          url =
            'https://tutorial.neoline.io/v/cn/xin-shou-zhi-nan/zi-chan-guan-li';
        } else {
          url = 'https://tutorial.neoline.io/getting-started/manage-assets';
        }
        break;
      case 'txs':
        if (this.lang === 'zh_CN') {
          url =
            'https://tutorial.neoline.io/v/cn/neox-qian-bao-de-chuang-jian-he-shi-yong/guan-yu-neoline-activity';
        } else {
          url =
            'https://tutorial.neoline.io/create-and-manage-neo-x-wallet/about-neoline-activity';
        }
        break;
    }
    window.open(url);
  }
}
