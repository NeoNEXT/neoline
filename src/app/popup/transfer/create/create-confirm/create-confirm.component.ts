import {
  Component,
  Input,
  OnInit,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { GAS3_CONTRACT, LedgerStatuses, STORAGE_NAME } from '../../../_lib';
import { GAS } from '@/models/models';
import { NeoDataJsonProp, TransferData } from '../interface';
import {
  AssetState,
  GlobalService,
  LedgerService,
  TransactionState,
  ChromeService,
} from '@/app/core';
import { BigNumber } from 'bignumber.js';
import {
  PopupEditFeeDialogComponent,
  PopupTransferSuccessDialogComponent,
} from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';
import { Transaction as Transaction2 } from '@cityofzion/neon-core/lib/tx';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { TransferService } from '../../transfer.service';
import { Observable } from 'rxjs';
import { interval } from 'rxjs';
import { Neo3TransferService } from '../../neo3-transfer.service';
import { AssetEVMState } from '@/app/core/states/asset-evm.state';
import { ETH_SOURCE_ASSET_HASH } from '@/app/popup/_lib/evm';
import { ethers } from 'ethers';

export type TabType = 'details' | 'data';

@Component({
  selector: 'transfer-create-confirm',
  templateUrl: 'create-confirm.component.html',
  styleUrls: ['create-confirm.component.scss'],
})
export class TransferCreateConfirmComponent implements OnInit, OnDestroy {
  @Input() data: TransferData;
  @Output() backAmount = new EventEmitter();
  rateCurrency = '';
  unsignedTx: Transaction2 | Transaction3;
  networkFee: string;
  systemFee: string;
  totalFee: string;
  gasPrice: BigNumber;
  assetPrice: BigNumber;
  rate = { amount: '0', fee: '', networkFee: '', systemFee: '', total: '' };

  tabType: TabType = 'details';
  dataJson: NeoDataJsonProp;
  txSerialize: string;

  loading = false;
  loadingMsg: string;
  getStatusInterval;

  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  evmHexData: string;
  unsignedEvmTx: ethers.TransactionRequest;

  constructor(
    private assetState: AssetState,
    private dialog: MatDialog,
    private transfer: TransferService,
    private global: GlobalService,
    private ledger: LedgerService,
    private txState: TransactionState,
    private neo3Transfer: Neo3TransferService,
    private chrome: ChromeService,
    private assetEvmState: AssetEVMState
  ) {}
  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  async ngOnInit(): Promise<void> {
    this.getDataJson();
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
    this.rate.fee = await this.getGasRate(this.data.fee);
    if (!this.data.isNFT) {
      this.rate.amount = await this.getAssetRate(this.data.amount);
    }
    this.createTx();
  }

  back() {
    this.backAmount.emit();
  }
  cancel() {
    history.go(-1);
  }
  editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
        data: {
          fee: this.data.fee,
        },
      })
      .afterClosed()
      .subscribe(async (res) => {
        if (res !== false) {
          this.data.fee = res;
          this.dataJson.fee = res;
          this.rate.fee = await this.getGasRate(this.data.fee);
          this.createTx();
        }
      });
  }

  getShowAmount() {
    const newAmount = new BigNumber(this.data.amount).dp(8, 1).toFixed();
    if (newAmount === '0') {
      return '< 0.0000001';
    }
    return newAmount;
  }

  //#region EVM
  getEvmTotalData() {
    return new BigNumber(this.data.amount)
      .plus(this.data.neoXFeeInfo.estimateGas)
      .dp(8)
      .toFixed();
  }
  updateEvmFee($event) {
    this.data.neoXFeeInfo = $event;
  }
  //#endregion

  //#region sign tx
  async confirm() {
    if (this.data.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      if (this.data.chainType === 'NeoX') {
        await this.getEvmTxData();
      }
      this.loading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus();
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus();
      });
      return;
    }
    switch (this.data.chainType) {
      case 'Neo2':
        this.unsignedTx.sign(this.data.currentWIF);
        break;
      case 'Neo3':
        this.unsignedTx.sign(
          this.data.currentWIF,
          this.data.network.magicNumber
        );
        break;
    }
    this.resolveSend();
  }
  private async getEvmTxData() {
    const { asset, to, amount, neoXFeeInfo } = this.data;
    const { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit } =
      neoXFeeInfo;
    this.unsignedEvmTx = this.assetEvmState.getTransferErc20TxRequest({
      asset: asset,
      toAddress: to.address,
      transferAmount: amount,
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit,
      gasPrice,
    });
    const nonce = await this.assetEvmState.getNonce(
      this.data.currentWallet.accounts[0].address
    );
    this.unsignedEvmTx.nonce = nonce;
  }
  private getLedgerStatus() {
    this.ledger.getDeviceStatus(this.data.chainType).then(async (res) => {
      switch (this.data.chainType) {
        case 'Neo2':
          this.loadingMsg = LedgerStatuses[res].msg;
          break;
        case 'Neo3':
          this.loadingMsg =
            LedgerStatuses[res].msgNeo3 || LedgerStatuses[res].msg;
          break;
        case 'NeoX':
          this.loadingMsg =
            LedgerStatuses[res].msgNeoX || LedgerStatuses[res].msg;
          break;
      }
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';
        this.ledger
          .getLedgerSignedTx(
            this.data.chainType === 'NeoX'
              ? this.unsignedEvmTx
              : this.unsignedTx,
            this.data.currentWallet,
            this.data.chainType,
            this.data.network.magicNumber
          )
          .then((tx) => {
            this.loading = false;
            this.unsignedTx = tx;
            this.unsignedEvmTx = tx;
            this.resolveSend();
          })
          .catch((error) => {
            this.loading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }
  private async resolveSend() {
    this.loadingMsg = 'Wait';
    try {
      let res;
      let txid: string;
      switch (this.data.chainType) {
        case 'Neo2':
          try {
            res = await this.txState.rpcSendRawTransaction(
              this.unsignedTx.serialize(true)
            );
          } catch (error) {
            throw {
              msg: 'Transaction rejected by RPC node.',
            };
          }
          txid = '0x' + this.unsignedTx.hash;
          break;
        case 'Neo3':
          try {
            res = await this.neo3Transfer.sendNeo3Tx(
              this.unsignedTx as Transaction3
            );
          } catch (error) {
            throw {
              msg: 'Transaction rejected by RPC node.',
            };
          }
          txid = res;
          break;
        case 'NeoX':
          this.loading = true;
          const { currentWIF } = this.data;
          if (this.data.currentWallet.accounts[0].extra.ledgerSLIP44) {
            txid = await this.assetEvmState.sendTransactionByRPC(
              this.unsignedEvmTx
            );
          } else {
            const { asset, to, amount, neoXFeeInfo } = this.data;
            const { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit } =
              neoXFeeInfo;
            res = await this.assetEvmState.transferErc20({
              asset: asset,
              toAddress: to.address,
              transferAmount: amount,
              maxFeePerGas,
              maxPriorityFeePerGas,
              gasLimit,
              gasPrice,
              privateKey: currentWIF,
            });
            txid = res.hash;
          }
          break;
      }
      if (
        this.data.from !== this.data.to.address ||
        this.data.chainType === 'NeoX'
      ) {
        const txTarget = {
          txid,
          value: `-${this.data.amount}`,
          block_time: Math.floor(new Date().getTime() / 1000),
          from: [this.data.from],
          to: [this.data.to.address],
          type: 'sent',
        };
        if (this.data.isNFT) {
          txTarget['tokenid'] = this.data.nftToken.tokenid;
        } else {
          txTarget['symbol'] = this.data.asset.symbol;
          txTarget['asset_id'] =
            this.data.asset.asset_id !== ETH_SOURCE_ASSET_HASH
              ? this.data.asset.asset_id
              : undefined;
        }
        this.pushTransaction(txTarget);
      }
      // todo transfer done
      this.global.log('transfer done', 'res');
      this.dialog
        .open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
        })
        .afterClosed()
        .subscribe(() => {
          history.go(-1);
        });
      this.loading = false;
      this.loadingMsg = '';
    } catch (err) {
      this.global.handlePrcError(err, 'Neo2');
    }
    this.loading = false;
    this.loadingMsg = '';
  }
  private pushTransaction(transaction: any) {
    const networkName = `${this.data.chainType}-${this.data.network.id}`;
    const address = this.data.from;
    const assetId = this.data.isNFT
      ? this.data.nftContract
      : this.data.asset.asset_id;
    this.chrome.getStorage(STORAGE_NAME.transaction).subscribe(async (res) => {
      if (res === null || res === undefined) {
        res = {};
      }
      if (res[networkName] === undefined) {
        res[networkName] = {};
      }
      if (res[networkName][address] === undefined) {
        res[networkName][address] = {};
      }
      if (res[networkName][address][assetId] === undefined) {
        res[networkName][address][assetId] = [];
      }
      res[networkName][address][assetId].unshift(transaction);
      this.chrome.setStorage(STORAGE_NAME.transaction, res);
      const setData = {};
      setData[`TxArr_${networkName}`] =
        (await this.chrome.getLocalStorage(`TxArr_${networkName}`)) || [];
      setData[`TxArr_${networkName}`].push(transaction.txid);
      this.chrome.setLocalStorage(setData);
    });
  }
  //#endregion

  //#region init
  private createTx() {
    if (this.data.chainType === 'NeoX') {
      return;
    }
    this.loading = true;
    let createTxReq: Observable<Transaction2 | Transaction3>;
    if (this.data.isNFT) {
      createTxReq = this.transfer.create(
        this.data.from,
        this.data.to.address,
        this.data.nftContract,
        this.data.amount,
        this.data.fee || 0,
        0,
        false,
        this.data.nftToken.tokenid
      );
    } else {
      createTxReq = this.transfer.create(
        this.data.from,
        this.data.to.address,
        this.data.asset.asset_id,
        this.data.amount,
        this.data.fee || '0',
        this.data.asset.decimals
      );
    }
    createTxReq.subscribe(
      async (res: Transaction2 | Transaction3) => {
        this.unsignedTx = res;
        this.txSerialize = res.serialize(false);
        if (this.data.chainType === 'Neo3') {
          this.networkFee = new BigNumber(
            (res as Transaction3).networkFee.toDecimal(8)
          )
            .minus(this.data.fee)
            .toFixed();
          this.systemFee = (res as Transaction3).systemFee.toDecimal(8);
          this.rate.networkFee = await this.getGasRate(this.networkFee);
          this.rate.systemFee = await this.getGasRate(this.systemFee);
        }
        this.getTotalData();
        this.loading = false;
      },
      (err) => {
        this.loading = false;
        this.global.snackBarTip('wentWrong', err, 10000);
      }
    );
  }
  private async getTotalData() {
    this.totalFee = this.data.fee;
    let totalFeeRate = this.rate.fee;
    if (this.data.chainType === 'Neo3') {
      this.totalFee = new BigNumber(this.totalFee)
        .plus(this.networkFee)
        .plus(this.systemFee)
        .toFixed();
      totalFeeRate = await this.getGasRate(this.totalFee);
    }
    this.rate.total = new BigNumber(this.rate.amount)
      .plus(totalFeeRate)
      .toFixed();
  }
  private getDataJson() {
    this.dataJson = {
      fromAddress: this.data.from,
      toAddress: this.data.to.address,
      symbol: this.data.isNFT
        ? this.data.nftToken.symbol
        : this.data.asset.symbol,
      asset: this.data.isNFT ? this.data.nftContract : this.data.asset.asset_id,
      tokenId: this.data.isNFT ? this.data.nftToken.tokenid : undefined,
      amount: this.data.amount,
      fee: this.data.chainType === 'NeoX' ? undefined : this.data.fee,
      estimatedFee:
        this.data.chainType === 'NeoX'
          ? this.data.neoXFeeInfo.estimateGas
          : undefined,
      networkFee: this.networkFee,
      systemFee: this.systemFee,
      networkId:
        this.data.chainType === 'NeoX' ? undefined : this.data.network.id,
      chainId:
        this.data.chainType === 'NeoX' ? this.data.network.chainId : undefined,
    };

    if (
      this.data.chainType === 'NeoX' &&
      this.data.asset.asset_id !== ETH_SOURCE_ASSET_HASH
    ) {
      const amountBN = BigInt(
        new BigNumber(this.data.amount)
          .shiftedBy(this.data.asset.decimals)
          .toFixed(0, 1)
      );
      this.evmHexData = this.assetEvmState.getTransferERC20Data({
        asset: this.data.asset,
        toAddress: this.data.to.address,
        transferAmount: amountBN,
      });
    }
  }
  //#endregion

  //#region rate
  private getGasRate(value: string) {
    if (this.data.chainType === 'NeoX') return '0';
    if (this.gasPrice) {
      return new BigNumber(value).times(this.gasPrice).toFixed();
    }
    const gasAassetId = this.data.chainType === 'Neo3' ? GAS3_CONTRACT : GAS;
    return this.assetState.getAssetRate('GAS', gasAassetId).then((res) => {
      this.gasPrice = res ? res : new BigNumber(0);
      return new BigNumber(value).times(this.gasPrice).toFixed();
    });
  }
  private getAssetRate(value: string) {
    if (this.data.chainType === 'NeoX') return '0';
    if (this.assetPrice) {
      return new BigNumber(value).times(this.assetPrice).toFixed();
    }
    return this.assetState
      .getAssetRate(this.data.asset.symbol, this.data.asset.asset_id)
      .then((res) => {
        this.assetPrice = res ? res : new BigNumber(0);
        return new BigNumber(value).times(this.assetPrice).toFixed();
      });
  }
  //#endregion
}
