import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { TransactionState, ChromeService } from '@/app/core';
import { Transaction } from '@/models/models';
import { forkJoin, Unsubscribable, interval } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { PopupTxDetailDialogComponent } from '@/app/popup/_dialogs';
import { STORAGE_NAME, ChainType } from '@/app/popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';

@Component({
  selector: 'app-asset-tx-page',
  templateUrl: 'asset-tx-page.component.html',
  styleUrls: ['../tx-page.scss'],
})
export class AssetTxPageComponent implements OnInit, OnDestroy {
  @Input() assetId = '';
  @Input() symbol = '';

  public show = false;
  public inTransaction: Array<Transaction>;
  public txData: Array<any> = [];
  public loading = false;
  private listenTxSub: Unsubscribable;
  private localAllTxs = {};

  private accountSub: Unsubscribable;
  private chainType: ChainType;
  private address: string;
  private networkId: number;
  constructor(
    private chrome: ChromeService,
    private txState: TransactionState,
    private dialog: MatDialog,
    private store: Store<AppState>
  ) {}
  ngOnInit(): void {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      const network =
        this.chainType === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : this.chainType === 'Neo3'
          ? state.n3Networks[state.n3NetworkIndex]
          : state.neoXNetworks[state.neoXNetworkIndex];
      this.networkId = network.id;
      this.getAllTxs();
    });
  }

  ngOnDestroy(): void {
    this.txData = [];
    this.accountSub?.unsubscribe();
    this.listenTxSub?.unsubscribe();
  }

  private getAllTxs() {
    this.loading = true;
    if (this.assetId === '') {
      this.txState.getAllTxs(this.address).then((res) => {
        this.txData = res || [];
        this.loading = false;
      });
    } else {
      const networkName = `${this.chainType}-${this.networkId}`;
      this.chrome.getStorage(STORAGE_NAME.transaction).subscribe((inTxData) => {
        this.localAllTxs = inTxData;
        if (inTxData?.[networkName]?.[this.address]?.[this.assetId]) {
          this.inTransaction =
            inTxData[networkName][this.address][this.assetId];
        } else {
          this.inTransaction = [];
        }
        this.inTransaction = this.inTransaction.filter(
          (item) => new Date().getTime() / 1000 - item.block_time <= 7200
        );
        this.handleTxs();
      });
    }
  }

  private handleTxs(validTxs?: string[]) {
    const httpReq1 = this.txState.getAssetTxs(this.address, this.assetId);
    let httpReq2;
    let txIdArray = [];
    const networkName = `${this.chainType}-${this.networkId}`;
    this.inTransaction.forEach((item) => {
      txIdArray.push(item.txid);
    });
    if (txIdArray.length === 0 || validTxs) {
      httpReq2 = new Promise<any>((mResolve) => {
        mResolve(validTxs ?? validTxs);
      });
    } else {
      httpReq2 = this.txState.getTxsValid(txIdArray, this.chainType);
    }
    forkJoin([httpReq1, httpReq2]).subscribe((result: any) => {
      let txData = result[0] || [];
      const txConfirm = result[1] || [];
      txConfirm.forEach((item) => {
        this.inTransaction = this.inTransaction.filter((e) => e.txid !== item);
        txIdArray = txIdArray.filter((e) => e !== item);
      });
      if (txIdArray.length > 0) {
        this.listenTxsValid(txIdArray);
      }
      if (this.localAllTxs[networkName] === undefined) {
        this.localAllTxs[networkName] = {};
      } else if (this.localAllTxs[networkName][this.address] === undefined) {
        this.localAllTxs[networkName][this.address] = {};
      } else if (
        this.localAllTxs[networkName][this.address][this.assetId] === undefined
      ) {
        this.localAllTxs[networkName][this.address][this.assetId] = [];
      } else {
        this.localAllTxs[networkName][this.address][this.assetId] =
          this.inTransaction;
      }
      this.chrome.setStorage(STORAGE_NAME.transaction, this.localAllTxs);
      txData = this.inTransaction.concat(txData);
      this.txData = txData;
      this.loading = false;
    });
  }

  private listenTxsValid(ids: string[]) {
    let req: Unsubscribable;
    this.listenTxSub = interval(15000).subscribe(() => {
      req?.unsubscribe();
      req = this.txState.getTxsValid(ids, this.chainType).subscribe((txIds) => {
        if (txIds.length > 0) {
          this.listenTxSub?.unsubscribe();
          this.handleTxs(txIds);
        }
      });
    });
  }

  showDetail(tx, symbol) {
    this.dialog.open(PopupTxDetailDialogComponent, {
      panelClass: 'custom-dialog-panel',
      data: { tx, symbol, isNFT: false },
    });
  }
}
