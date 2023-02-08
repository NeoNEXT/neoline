import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { TransactionState, ChromeService } from '@/app/core';
import { Transaction } from '@/models/models';
import { forkJoin } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { PopupTxDetailDialogComponent } from '@/app/popup/_dialogs';
import { STORAGE_NAME, ChainType } from '@/app/popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

@Component({
  selector: 'app-asset-tx-page',
  templateUrl: 'asset-tx-page.component.html',
  styleUrls: ['../tx-page.scss'],
})
export class AssetTxPageComponent implements OnInit, OnDestroy {
  @Input() assetId = '';
  @Input() symbol = '';
  rateCurrency: string;

  public show = false;
  public inTransaction: Array<Transaction>;
  public txData: Array<any> = [];
  public loading = false;

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
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      const network =
        this.chainType === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : state.n3Networks[state.n3NetworkIndex];
      this.networkId = network.id;
      this.getInTransactions();
    });
  }

  ngOnDestroy(): void {
    this.txData = [];
    this.accountSub?.unsubscribe();
  }

  public getInTransactions() {
    this.loading = true;
    const httpReq1 =
      this.assetId !== ''
        ? this.txState.getAssetTxs(this.address, this.assetId)
        : this.txState.getAllTxs(this.address);
    if (this.assetId === '') {
      httpReq1.then((res) => {
        this.txData = res || [];
        this.loading = false;
      });
    } else {
      this.chrome.getStorage(STORAGE_NAME.transaction).subscribe((inTxData) => {
        if (
          inTxData[this.networkId] === undefined ||
          inTxData[this.networkId][this.address] === undefined ||
          inTxData[this.networkId][this.address][this.assetId] === undefined
        ) {
          this.inTransaction = [];
        } else {
          this.inTransaction =
            inTxData[this.networkId][this.address][this.assetId];
        }
        const txIdArray = [];
        this.inTransaction = this.inTransaction.filter(
          (item) => new Date().getTime() / 1000 - item.block_time <= 7200
        );
        this.inTransaction.forEach((item) => {
          txIdArray.push(item.txid);
        });
        let httpReq2;
        if (txIdArray.length === 0) {
          httpReq2 = new Promise<any>((mResolve) => {
            mResolve([]);
          });
        } else {
          httpReq2 = this.txState.getTxsValid(txIdArray, this.chainType);
        }
        forkJoin([httpReq1, httpReq2]).subscribe((result: any) => {
          let txData = result[0] || [];
          const txConfirm = result[1] || [];
          txConfirm.forEach((item) => {
            const tempIndex = this.inTransaction.findIndex(
              (e) => e.txid === item
            );
            if (tempIndex >= 0) {
              this.inTransaction.splice(tempIndex, 1);
            }
          });
          if (inTxData[this.networkId] === undefined) {
            inTxData[this.networkId] = {};
          } else if (inTxData[this.networkId][this.address] === undefined) {
            inTxData[this.networkId][this.address] = {};
          } else if (
            inTxData[this.networkId][this.address][this.assetId] === undefined
          ) {
            inTxData[this.networkId][this.address][this.assetId] = [];
          } else {
            inTxData[this.networkId][this.address][this.assetId] =
              this.inTransaction;
          }
          this.chrome.setStorage(STORAGE_NAME.transaction, inTxData);
          txData = this.inTransaction.concat(txData);
          this.txData = txData;
          this.loading = false;
        });
      });
    }
  }

  showDetail(tx, symbol) {
    this.dialog.open(PopupTxDetailDialogComponent, {
      panelClass: 'custom-dialog-panel',
      data: { tx, symbol, isNFT: false },
    });
  }
}
