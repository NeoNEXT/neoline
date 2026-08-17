import { Component, OnInit, Type } from '@angular/core';
import { SettingState } from '@/app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { ActivatedRoute, Router } from '@angular/router';
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
  selectedTabType: 'asset' | 'NFT' | 'activity' | 'perpetual' = 'asset'; // asset tab or transaction tab
  perpsTabComponent: Type<unknown>;
  perpsModule: Type<unknown>;
  rateCurrency: string;
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
    private route: ActivatedRoute,
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
      this.selectedTabType = 'asset';
    });
  }

  ngOnInit(): void {
    // Coming back from a perps sub-page: reopen the tab the user left from,
    // instead of dropping them on assets and making them find perps again.
    if (this.route.snapshot.queryParams.tab === 'perps') {
      this.showPerps();
    }
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

  async showPerps() {
    this.selectedTabType = 'perpetual';
    if (this.perpsTabComponent) {
      return;
    }

    const { PerpsModule, PerpsTabComponent } = await import(
      '../perps/perps.module'
    );
    this.perpsModule = PerpsModule;
    this.perpsTabComponent = PerpsTabComponent;
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
    if (this.chainType === 'Neo3' && this.selectedTabType === 'NFT') {
      this.router.navigateByUrl('/popup/add-nft');
    } else if (this.chainType === 'NeoX' && this.selectedTabType === 'NFT') {
      this.router.navigateByUrl('/popup/add-evm-nft');
    } else {
      this.router.navigateByUrl('/popup/add-asset');
    }
  }
  getSupport(type: 'asset' | 'txs' = 'asset') {
    this.settingState.toWeb(type === 'asset' ? 'manageAsset' : 'manageTx');
  }

  toDiscover() {
    if (chrome.tabs) {
      chrome.tabs.create({ url: 'https://app.neoline.io' });
    } else {
      window.open('https://app.neoline.io', '_blank');
    }
  }
}
