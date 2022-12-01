import { Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { NeonService, ChromeService } from '@/app/core';
import {
  RpcNetwork,
  ChainType,
  ADD_NEO2_WALLET,
  ADD_NEO3_WALLET,
} from '../_lib';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

type TabType = 'create' | 'import';
@Component({
  templateUrl: 'wallet.component.html',
  styleUrls: ['wallet.component.scss'],
})
export class PopupWalletComponent {
  tabType: TabType = 'import';
  private dapiData = {
    type: null,
    hostname: '',
    messageID: '',
    chainType: '',
  };

  private accountSub: Unsubscribable;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  private chainType: ChainType;
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private neon: NeonService,
    private chrome: ChromeService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.chainType = state.currentChainType;
    });
    this.route.queryParams.subscribe((params: any) => {
      this.dapiData = {
        type: params.type,
        hostname: params.hostname,
        chainType: params.chainType,
        messageID: params.messageID,
      };
    });
  }

  public updateLocalWallet(data: any, type: number) {
    const newChainType = wallet3.isAddress(data.accounts[0].address, 53)
      ? 'Neo3'
      : 'Neo2';
    if (newChainType !== this.chainType) {
      this.chrome.networkChangeEvent(
        newChainType === 'Neo2' ? this.n2Network : this.n3Network
      );
    }
    if (this.neon.selectedChainType === 'Neo2') {
      this.store.dispatch({
        type: ADD_NEO2_WALLET,
        data: { wallet: data, wif: data.accounts[0].wif },
      });
    } else {
      this.store.dispatch({
        type: ADD_NEO3_WALLET,
        data: { wallet: data, wif: data.accounts[0].wif },
      });
    }
    if (this.dapiData.type === 'dapi') {
      const params = `type=dapi&hostname=${this.dapiData.hostname}&chainType=${this.dapiData.chainType}&messageID=${this.dapiData.messageID}`;
      this.router.navigateByUrl(`/popup/notification/pick-address?${params}`);
      return;
    }
    this.chrome.setHasLoginAddress(data.accounts[0].address);
    this.chrome.setWallet(data.export());
    this.chrome.setLogin(false);
    if (type === 0) {
      this.chrome.setHaveBackupTip(true);
    } else {
      this.chrome.setWalletsStatus(data.accounts[0].address);
      this.chrome.setHaveBackupTip(false);
    }
    const returnUrl =
      this.route.snapshot.queryParams.returnUrl ||
      (type === 0 ? '/popup/backup' : '/popup');
    this.router.navigateByUrl(returnUrl);
  }
}
