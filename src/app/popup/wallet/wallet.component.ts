import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { NeonService, ChromeService } from '@/app/core';
import { FormControl } from '@angular/forms';
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
@Component({
  templateUrl: 'wallet.component.html',
  styleUrls: ['wallet.component.scss'],
})
export class PopupWalletComponent implements OnInit, OnDestroy {
  public createStatus = 'hibernate';
  public importStatus = '';
  public type: 'dapi' = null;
  public hostname: string;
  public messageID: string;
  public selected = new FormControl(2);

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
      this.chainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
    });
    this.initOperate(router.url);
    this.route.queryParams.subscribe((params: any) => {
      this.type = params.type;
      this.hostname = params.hostname;
      this.chainType = params.chainType;
      this.messageID = params.messageID;
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  public initOperate(url: string) {
    const urlParse = url.split('/');
    if (urlParse.length === 3) {
      this.createStatus = '';
      this.importStatus = 'hibernate';
      this.selected.setValue(0);
    } else {
      this.selected.setValue(urlParse[3].startsWith('import') ? 1 : 0);
    }
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
    if (this.type === 'dapi') {
      const params = `type=dapi&hostname=${this.hostname}&chainType=${this.chainType}&messageID=${this.messageID}`;
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

  ngOnInit(): void {}
}
