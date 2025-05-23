import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { TransactionState, ChromeService, AssetEVMState } from '@/app/core';
import { Transaction, TransactionStatus } from '@/models/models';
import { forkJoin, Unsubscribable, interval } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
  PopupSpeedUpFeeDialogComponent,
  PopupTxDetailDialogComponent,
} from '@/app/popup/_dialogs';
import {
  STORAGE_NAME,
  ChainType,
  RpcNetwork,
  EvmWalletJSON,
} from '@/app/popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';

@Component({
  selector: 'app-asset-tx-page',
  templateUrl: '../tx-page.component.html',
  styleUrls: ['../tx-page.component.scss'],
})
export class AssetTxPageComponent implements OnInit, OnDestroy {
  TransactionStatus = TransactionStatus;
  @Input() assetId = '';
  @Input() symbol = '';

  public show = false;
  public inTransaction: Array<Transaction>;
  public txData: Array<Transaction> = [];
  public loading = false;
  private listenTxSub: Unsubscribable;
  private localAllTxs = {};

  private accountSub: Unsubscribable;
  chainType: ChainType;
  private address: string;
  private currentWallet: EvmWalletJSON;
  private network: RpcNetwork;
  networkIndex: number;
  private networkId: number;
  constructor(
    private chrome: ChromeService,
    private txState: TransactionState,
    private dialog: MatDialog,
    private assetEVMState: AssetEVMState,
    private store: Store<AppState>
  ) {}
  ngOnInit(): void {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
      switch (this.chainType) {
        case 'Neo2':
          this.network = state.n2Networks[state.n2NetworkIndex];
          this.networkIndex = state.n2NetworkIndex;
          break;
        case 'Neo3':
          this.network = state.n3Networks[state.n3NetworkIndex];
          this.networkIndex = state.n3NetworkIndex;
          break;
        case 'NeoX':
          this.network = state.neoXNetworks[state.neoXNetworkIndex];
          this.networkIndex = state.neoXNetworkIndex;
          this.currentWallet = state.currentWallet as EvmWalletJSON;
          break;
      }
      this.networkId = this.network.id;
      if (this.chainType === 'NeoX') {
        this.getEvmAllTxs();
      } else {
        this.getAllTxs();
      }
    });
  }

  ngOnDestroy(): void {
    this.txData = [];
    this.accountSub?.unsubscribe();
    this.listenTxSub?.unsubscribe();
    this.assetEVMState.removeWaitTxListen();
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

  private getEvmAllTxs() {
    const networkName = `${this.chainType}-${this.networkId}`;
    this.chrome.getStorage(STORAGE_NAME.transaction).subscribe((inTxData) => {
      if (!inTxData?.[networkName]) {
        inTxData[networkName] = {};
      }
      if (!inTxData[networkName]?.[this.address]) {
        inTxData[networkName][this.address] = {};
      }
      if (!inTxData[networkName][this.address]?.[this.assetId]) {
        inTxData[networkName][this.address][this.assetId] = [];
      }
      Object.keys(inTxData[networkName][this.address]).forEach((assetId) => {
        let txs = inTxData[networkName][this.address][assetId];
        txs = txs.filter(
          (item) => new Date().getTime() / 1000 - item.block_time <= 2592000 // 30 days
        );
        inTxData[networkName][this.address][assetId] = txs;
      });
      this.localAllTxs = inTxData;
      this.chrome.setStorage(STORAGE_NAME.transaction, this.localAllTxs);
      if (this.assetId) {
        this.txData = inTxData[networkName][this.address][this.assetId];
      } else {
        this.txData = this.getEvmAddressAllTx(
          inTxData[networkName][this.address]
        );
      }
      for (let i = 0; i < this.txData.length; i++) {
        const item = this.txData[i];
        if (
          item?.status === undefined ||
          item?.status === TransactionStatus.Canceling ||
          item?.status === TransactionStatus.Accelerating
        ) {
          this.assetEVMState.waitForTx(item.txid).then((res) => {
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
            if (this.assetId) {
              this.localAllTxs[networkName][this.address][this.assetId] =
                this.txData;
            } else {
              const index = this.localAllTxs[networkName][this.address][
                this.txData[i].asset_id ?? 'dapp'
              ].findIndex((tx) => tx.txid === this.txData[i].txid);

              this.localAllTxs[networkName][this.address][
                this.txData[i].asset_id ?? 'dapp'
              ][index] = this.txData[i];
            }
            this.chrome.setStorage(STORAGE_NAME.transaction, this.localAllTxs);
          });
        }
      }
    });
  }

  getEvmAddressAllTx(data: { [asset: string]: Transaction[] }) {
    let txArr = [];
    Object.keys(data).forEach((assetId) => {
      txArr = txArr.concat(data[assetId]);
    });
    txArr.sort((a, b) => b.block_time - a.block_time);

    return txArr;
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
    let time = this.chainType === 'Neo3' ? 3000 : 15000;
    this.listenTxSub = interval(time).subscribe(() => {
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
    this.dialog
      .open(PopupTxDetailDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          tx,
          symbol,
          isNFT: false,
          chainType: this.chainType,
          networkIndex: this.networkIndex,
          network: this.network,
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
