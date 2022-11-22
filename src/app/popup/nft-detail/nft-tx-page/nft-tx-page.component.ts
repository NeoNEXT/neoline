import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import {
  GlobalService,
  NeonService,
  NftState,
  ChromeService,
  HttpService,
  TransactionState,
} from '@/app/core';
import { NftTransaction } from '@/models/models';
import { MatDialog } from '@angular/material/dialog';
import { PopupNftTxDetailDialogComponent } from '@/app/popup/_dialogs';
import { STORAGE_NAME } from '../../_lib';

@Component({
  selector: 'app-nft-tx-page',
  templateUrl: 'nft-tx-page.component.html',
  styleUrls: ['nft-tx-page.component.scss'],
})
export class PopupNftTxPageComponent implements OnInit, OnDestroy {
  @Input() nftContract: string;
  @Input() symbol = '';

  public show = false;
  public networkId: number;
  public address: string;
  public inTransaction: Array<NftTransaction>;
  public txData: Array<any> = [];
  public currentPage = 0;
  public loading = false;
  public noMoreData: boolean = false;
  constructor(
    private global: GlobalService,
    private neon: NeonService,
    private dialog: MatDialog,
    private nftState: NftState,
    private chrome: ChromeService,
    private http: HttpService,
    private txState: TransactionState
  ) {}
  ngOnInit(): void {
    this.networkId = this.global.n3Network.id;
    this.address = this.neon.address;
    this.txData = [];
    this.getInTransactions();
  }

  ngOnDestroy(): void {
    this.txData = [];
  }

  public getInTransactions() {
    this.loading = true;
    const httpReq1 = this.nftState.getNftTransactions(
      this.neon.address,
      this.nftContract
    );
    this.chrome.getStorage(STORAGE_NAME.transaction).subscribe((inTxData) => {
      if (
        inTxData[this.networkId] === undefined ||
        inTxData[this.networkId][this.address] === undefined ||
        inTxData[this.networkId][this.address][this.nftContract] === undefined
      ) {
        this.inTransaction = [];
      } else {
        this.inTransaction =
          inTxData[this.networkId][this.address][this.nftContract];
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
        httpReq2 = this.txState.getTxsValid(txIdArray, 'Neo3').toPromise();
      }
      Promise.all([httpReq1, httpReq2]).then((result: any) => {
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
          inTxData[this.networkId][this.address][this.nftContract] === undefined
        ) {
          inTxData[this.networkId][this.address][this.nftContract] = [];
        } else {
          inTxData[this.networkId][this.address][this.nftContract] =
            this.inTransaction;
        }
        this.chrome.setStorage(STORAGE_NAME.transaction, inTxData);
        this.inTransaction = this.handleLocalTxs(this.inTransaction);
        txData = this.inTransaction.concat(txData);
        this.txData = txData;
        this.loading = false;
      });
    });
  }

  handleLocalTxs(txs: any[]): any[] {
    return txs.map(({ txid, block_time, value, tokenid }) => ({
      hash: txid,
      amount: value,
      block_time,
      tokenid,
    }));
  }

  showDetail(tx) {
    this.dialog.open(PopupNftTxDetailDialogComponent, {
      panelClass: 'custom-dialog-panel',
      data: {
        tx,
        address: this.address,
      },
    });
  }
}
