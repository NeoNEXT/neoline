import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import {
  NftState,
  ChromeService,
  TransactionState,
  AssetEVMState,
} from '@/app/core';
import { NftTransaction } from '@/models/models';
import { MatDialog } from '@angular/material/dialog';
import { PopupTxDetailDialogComponent } from '@/app/popup/_dialogs';
import { ChainType, STORAGE_NAME } from '../../../../popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { forkJoin, Unsubscribable, interval } from 'rxjs';

@Component({
  selector: 'app-nft-tx-page',
  templateUrl: 'nft-tx-page.component.html',
  styleUrls: ['../tx-page.scss'],
})
export class NftTxPageComponent implements OnInit, OnDestroy {
  @Input() nftContract: string;
  @Input() symbol: string;

  public show = false;
  public inTransaction: Array<NftTransaction>;
  public txData: Array<any> = [];
  public loading = false;
  private listenTxSub: Unsubscribable;
  private localAllTxs = {};

  private accountSub: Unsubscribable;
  public networkId: number;
  public address: string;
  private chainType: ChainType;
  constructor(
    private dialog: MatDialog,
    private nftState: NftState,
    private chrome: ChromeService,
    private txState: TransactionState,
    private assetEVMState: AssetEVMState,
    private store: Store<AppState>
  ) {}

  ngOnInit(): void {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.chainType = state.currentChainType;
      if (this.chainType === 'Neo3') {
        this.networkId = state.n3Networks[state.n3NetworkIndex].id;
        this.getAllTxs();
      } else {
        this.networkId = state.neoXNetworks[state.neoXNetworkIndex].id;
        this.getEvmAllTxs();
      }
    });
  }

  ngOnDestroy(): void {
    this.txData = [];
    this.accountSub?.unsubscribe();
    this.listenTxSub?.unsubscribe();
  }

  private getAllTxs() {
    this.loading = true;
    const networkName = `${this.chainType}-${this.networkId}`;
    this.chrome.getStorage(STORAGE_NAME.transaction).subscribe((inTxData) => {
      this.localAllTxs = inTxData;
      if (inTxData?.[networkName]?.[this.address]?.[this.nftContract]) {
        this.inTransaction =
          inTxData[networkName][this.address][this.nftContract];
      } else {
        this.inTransaction = [];
      }
      this.inTransaction = this.inTransaction.filter(
        (item) => new Date().getTime() / 1000 - item.block_time <= 7200
      );
      this.handleTxs();
    });
  }
  private getEvmAllTxs() {
    const networkName = `${this.chainType}-${this.networkId}`;
    this.chrome
      .getStorage(STORAGE_NAME.transaction)
      .subscribe(async (inTxData) => {
        this.localAllTxs = inTxData;
        this.txData =
          inTxData?.[networkName]?.[this.address]?.[this.nftContract] || [];
        for (let i = 0; i < this.txData.length; i++) {
          const item = this.txData[i];
          if (item?.status === undefined) {
            const res = await this.assetEVMState.waitForTx(item.txid);
            this.txData[i].status = res.status;
            this.txData[i].block_time = res.block_time;
            this.localAllTxs[networkName][this.address][this.nftContract] =
              this.txData;
            this.chrome.setStorage(STORAGE_NAME.transaction, this.localAllTxs);
          }
        }
      });
  }

  private handleTxs(validTxs?: string[]) {
    const httpReq1 = this.nftState.getNftTransactions(
      this.address,
      this.nftContract
    );
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
      httpReq2 = this.txState.getTxsValid(txIdArray, 'Neo3');
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
        this.localAllTxs[networkName][this.address][this.nftContract] ===
        undefined
      ) {
        this.localAllTxs[networkName][this.address][this.nftContract] = [];
      } else {
        this.localAllTxs[networkName][this.address][this.nftContract] =
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
      req = this.txState.getTxsValid(ids, 'Neo3').subscribe((txIds) => {
        if (txIds.length > 0) {
          this.listenTxSub?.unsubscribe();
          this.handleTxs(txIds);
        }
      });
    });
  }

  showDetail(tx) {
    this.dialog.open(PopupTxDetailDialogComponent, {
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
      data: { tx, symbol: this.symbol, isNFT: true },
    });
  }
}
