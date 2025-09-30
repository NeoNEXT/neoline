import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import {
  NftState,
  ChromeService,
  TransactionState,
  EvmTxService,
} from '@/app/core';
import {
  NftTransaction,
  Transaction,
  TransactionStatus,
} from '@/models/models';
import { MatDialog } from '@angular/material/dialog';
import {
  PopupSpeedUpFeeDialogComponent,
  PopupTxDetailDialogComponent,
} from '@/app/popup/_dialogs';
import {
  ChainType,
  EvmWalletJSON,
  RpcNetwork,
  STORAGE_NAME,
} from '../../../../popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { forkJoin, Unsubscribable, interval } from 'rxjs';

@Component({
  selector: 'app-nft-tx-page',
  templateUrl: '../tx-page.component.html',
  styleUrls: ['../tx-page.component.scss'],
})
export class NftTxPageComponent implements OnInit, OnDestroy {
  TransactionStatus = TransactionStatus;
  @Input() nftContract: string;
  @Input() symbol: string;

  public show = false;
  public inTransaction: Array<NftTransaction>;
  public txData: Array<Transaction> = [];
  public loading = false;
  private listenTxSub: Unsubscribable;
  private localAllTxs = {};

  private accountSub: Unsubscribable;
  public network: RpcNetwork;
  public networkIndex: number;
  public networkId: number;
  public address: string;
  private currentWallet: EvmWalletJSON;
  chainType: ChainType;
  constructor(
    private dialog: MatDialog,
    private nftState: NftState,
    private chrome: ChromeService,
    private txState: TransactionState,
    private store: Store<AppState>,
    private evmTxService: EvmTxService
  ) {}

  ngOnInit(): void {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
      this.currentWallet = state.currentWallet as EvmWalletJSON;
      this.chainType = state.currentChainType;
      if (this.chainType === 'Neo3') {
        this.networkIndex = state.n3NetworkIndex;
        this.network = state.n3Networks[state.n3NetworkIndex];
        this.networkId = this.network.id;
        this.getAllTxs();
      } else {
        this.networkIndex = state.neoXNetworkIndex;
        this.network = state.neoXNetworks[state.neoXNetworkIndex];
        this.networkId = this.network.id;
        this.getEvmAllTxs();
      }
    });
  }

  ngOnDestroy(): void {
    this.txData = [];
    this.accountSub?.unsubscribe();
    this.listenTxSub?.unsubscribe();
    this.evmTxService.removeWaitTxListen();
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
        if (!inTxData?.[networkName]) {
          inTxData[networkName] = {};
        }
        if (!inTxData[networkName]?.[this.address]) {
          inTxData[networkName][this.address] = {};
        }
        if (!inTxData[networkName][this.address]?.[this.nftContract]) {
          inTxData[networkName][this.address][this.nftContract] = [];
        }
        let txs = inTxData[networkName][this.address][this.nftContract];
        txs = txs.filter(
          (item) => new Date().getTime() / 1000 - item.block_time <= 2592000 // 30 days
        );
        this.txData = txs;
        inTxData[networkName][this.address][this.nftContract] = txs;
        this.localAllTxs = inTxData;
        this.chrome.setStorage(STORAGE_NAME.transaction, this.localAllTxs);
        for (let i = 0; i < this.txData.length; i++) {
          const item = this.txData[i];
          if (
            item?.status === undefined ||
            item?.status === TransactionStatus.Canceling ||
            item?.status === TransactionStatus.Accelerating
          ) {
            const res = await this.evmTxService.waitForTx(item.txid);
            this.txData[i].status =
              this.txData[i].status === TransactionStatus.Canceling
                ? TransactionStatus.Cancelled
                : res.status;
            this.txData[i].block_time = res.block_time;
            if (res.status !== TransactionStatus.Dropped) {
              this.txData[i].history.push({
                txId: item.txid,
                time: res.block_time,
                type: 'complete',
              });
            }
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
    let time = this.chainType === 'Neo3' ? 3000 : 15000;
    this.listenTxSub = interval(time).subscribe(() => {
      req?.unsubscribe();
      req = this.txState.getTxsValid(ids, 'Neo3').subscribe((txIds) => {
        if (txIds.length > 0) {
          this.listenTxSub?.unsubscribe();
          this.handleTxs(txIds);
        }
      });
    });
  }

  showDetail(tx, symbol) {
    this.dialog
      .open(PopupTxDetailDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          tx,
          symbol,
          isNFT: true,
          chainType: this.chainType,
          network: this.network,
          networkIndex: this.networkIndex,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.speedUpTx(tx, res.isSpeedUp);
        }
      });
  }

  speedUpTx(tx: Transaction, isSpeedUp: boolean) {
    this.dialog
      .open(PopupSpeedUpFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          tx,
          isSpeedUp,
          network: this.network,
          currentWallet: this.currentWallet,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.getEvmAllTxs();
        }
      });
  }
}
