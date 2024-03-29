import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  AssetState,
  ChromeService,
  GlobalService,
  UtilServiceState,
} from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NEO, GAS, Asset } from '@/models/models';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '@popup/_dialogs';
import { bignumber } from 'mathjs';
import BigNumber from 'bignumber.js';
import {
  NEO3_CONTRACT,
  GAS3_CONTRACT,
  ChainType,
  RpcNetwork,
  STORAGE_NAME,
} from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

@Component({
  templateUrl: 'asset-detail.component.html',
  styleUrls: ['asset-detail.component.scss'],
})
export class PopupAssetDetailComponent implements OnInit, OnDestroy {
  assetId: string;
  balance: Asset;
  rateCurrency: string;

  showMenu = false;
  canHideBalance = false;
  private watch: Asset[]; // User-added assets

  private accountSub: Unsubscribable;
  private networkId: number;
  private address;
  private chainType: ChainType;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  constructor(
    private assetState: AssetState,
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private dialog: MatDialog,
    private global: GlobalService,
    private router: Router,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.networkId =
        this.chainType === 'Neo2' ? this.n2Network.id : this.n3Network.id;
      this.initData();
    });
  }

  initData() {
    this.aRouter.params.subscribe((params: any) => {
      this.assetId = params.assetId || NEO;
      this.getAssetDetail();
      this.getCanHide();
    });
  }

  ngOnInit(): void {
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  getCanHide() {
    const index = [NEO, GAS, NEO3_CONTRACT, GAS3_CONTRACT].indexOf(
      this.assetId
    );
    this.canHideBalance = index >= 0 ? false : true;
    if (this.canHideBalance) {
      this.chrome.getWatch(this.networkId, this.address).subscribe((res) => {
        this.watch = res;
      });
    }
  }

  async getAssetDetail() {
    const balance = await this.assetState.getAddressAssetBalance(
      this.address,
      this.assetId,
      this.chainType
    );
    const symbols = await this.util.getAssetSymbols(
      [this.assetId],
      this.chainType
    );
    const decimals = await this.util.getAssetDecimals(
      [this.assetId],
      this.chainType
    );
    this.balance = {
      asset_id: this.assetId,
      balance: new BigNumber(balance).shiftedBy(-decimals[0]).toFixed(),
      symbol: symbols[0],
      decimals: decimals[0],
    };
    this.getAssetRate();
  }

  getAssetRate() {
    if (
      this.balance.balance &&
      bignumber(this.balance.balance).comparedTo(0) > 0
    ) {
      this.assetState
        .getAssetRate(this.balance.symbol, this.balance.asset_id)
        .then((rate) => {
          this.balance.rateBalance =
            new BigNumber(this.balance.balance).times(rate || 0).toFixed() ||
            '0';
        });
    } else {
      this.balance.rateBalance = '0';
    }
  }

  hideBalance() {
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'delAssetTip',
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          const i = this.watch.findIndex((w) => w.asset_id === this.assetId);
          if (i >= 0) {
            this.watch.splice(i, 1);
          } else {
            this.balance.watching = false;
            this.watch.push(this.balance);
          }
          this.chrome.setWatch(this.networkId, this.address, this.watch);
          this.global.snackBarTip('hiddenSucc');
          this.router.navigateByUrl('/popup/home');
        }
      });
  }

  toWeb() {
    this.showMenu = false;
    switch (this.chainType) {
      case 'Neo2':
        const isNep5 = this.assetId !== NEO && this.assetId !== GAS;
        if (this.n2Network.explorer) {
          window.open(
            `${this.n2Network.explorer}${isNep5 ? 'nep5' : 'asset'}/${
              this.assetId
            }/page/1`
          );
        }
        break;
      case 'Neo3':
        if (this.n3Network.explorer) {
          window.open(`${this.n3Network.explorer}tokens/nep17/${this.assetId}`);
        }
        break;
    }
  }
}
