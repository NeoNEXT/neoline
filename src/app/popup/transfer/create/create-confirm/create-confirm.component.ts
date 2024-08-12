import {
  Component,
  Input,
  OnInit,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import {
  AddressNonceInfo,
  GAS3_CONTRACT,
  LedgerStatuses,
  STORAGE_NAME,
} from '../../../_lib';
import { GAS, Transaction } from '@/models/models';
import { NeoDataJsonProp, TransferData } from '../interface';
import {
  AssetState,
  GlobalService,
  LedgerService,
  TransactionState,
  ChromeService,
  UtilServiceState,
  EvmNFTState,
  SettingState,
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
  rate = { amount: '0', fee: '', networkFee: '', systemFee: '', total: '' };

  tabType: TabType = 'details';
  dataJson: NeoDataJsonProp;
  txSerialize: string;

  loading = false;
  loadingMsg: string;
  getStatusInterval;

  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  evmHexData: string;
  evmHexDataLength: number;
  unsignedEvmTx: ethers.TransactionRequest;
  nonceInfo: AddressNonceInfo;
  customNonce: number;
  insufficientFunds = false;

  constructor(
    private assetState: AssetState,
    private dialog: MatDialog,
    private transfer: TransferService,
    private global: GlobalService,
    private ledger: LedgerService,
    private txState: TransactionState,
    private neo3Transfer: Neo3TransferService,
    private chrome: ChromeService,
    private assetEvmState: AssetEVMState,
    private util: UtilServiceState,
    private settingState: SettingState,
    private evmNFTState: EvmNFTState
  ) {}
  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  async ngOnInit(): Promise<void> {
    this.getDataJson();
    this.settingState.rateCurrencySub.subscribe((res) => {
      this.rateCurrency = res;
    });
    if (this.data.chainType === 'NeoX') {
      this.rate.fee = await this.getGasRate(this.data.neoXFeeInfo.estimateGas);
    } else {
      this.rate.fee = await this.getGasRate(this.data.fee);
    }
    if (!this.data.isNFT) {
      this.assetState
        .getAssetAmountRate({
          chainType: this.data.chainType,
          assetId: this.data.asset.asset_id,
          chainId:
            this.data.chainType === 'NeoX'
              ? this.data.network.chainId
              : undefined,
          amount: this.data.amount,
        })
        .then((res) => {
          this.rate.amount = res;
        });
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
        backdropClass: 'custom-dialog-backdrop',
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
  changeNonce($event) {
    this.customNonce = $event;
  }
  getEvmTotalData() {
    return new BigNumber(this.data.amount)
      .plus(this.data.neoXFeeInfo.estimateGas)
      .dp(8)
      .toFixed();
  }
  updateEvmFee($event) {
    this.data.neoXFeeInfo = $event;
    this.checkBalance();
    this.getGasRate(this.data.neoXFeeInfo.estimateGas).then((res) => {
      this.rate.fee = res;
      this.rate.total = new BigNumber(this.rate.amount ?? 0)
        .plus(this.rate.fee ?? 0)
        .toFixed();
    });
  }
  private checkBalance() {
    if (
      !this.data.isNFT &&
      this.data.asset.asset_id === ETH_SOURCE_ASSET_HASH
    ) {
      if (
        new BigNumber(this.data.amount)
          .plus(this.data.neoXFeeInfo.estimateGas)
          .comparedTo(this.data.gasBalance) > 0
      ) {
        this.insufficientFunds = true;
      } else {
        this.insufficientFunds = false;
      }
    } else {
      if (
        new BigNumber(this.data.neoXFeeInfo.estimateGas).comparedTo(
          this.data.gasBalance
        ) > 0
      ) {
        this.insufficientFunds = true;
      } else {
        this.insufficientFunds = false;
      }
    }
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
    const { asset, to, amount, neoXFeeInfo, nftAsset, nftToken, from, isNFT } =
      this.data;
    const { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit } =
      neoXFeeInfo;
    if (isNFT) {
      const { newParams } = this.evmNFTState.getTransferTxRequest({
        asset: nftAsset,
        token: nftToken,
        fromAddress: from,
        toAddress: to.address,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
        gasPrice,
        nonce: this.customNonce ?? this.nonceInfo.nonce,
      });
      this.unsignedEvmTx = newParams;
    } else {
      const { newParams } = this.assetEvmState.getTransferErc20TxRequest({
        asset: asset,
        toAddress: to.address,
        transferAmount: amount,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
        gasPrice,
        nonce: this.customNonce ?? this.nonceInfo.nonce,
        fromAddress: from,
      });
      this.unsignedEvmTx = newParams;
    }
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
            const { asset, to, amount, neoXFeeInfo, nftAsset, nftToken, from } =
              this.data;
            const { maxFeePerGas, maxPriorityFeePerGas, gasPrice, gasLimit } =
              neoXFeeInfo;
            if (this.data.isNFT) {
              res = await this.evmNFTState.transferNFT({
                asset: nftAsset,
                token: nftToken,
                fromAddress: from,
                toAddress: to.address,
                maxFeePerGas,
                maxPriorityFeePerGas,
                gasLimit,
                gasPrice,
                privateKey: currentWIF,
                nonce: this.customNonce ?? this.nonceInfo.nonce,
              });
            } else {
              res = await this.assetEvmState.transferErc20({
                asset: asset,
                toAddress: to.address,
                transferAmount: amount,
                maxFeePerGas,
                maxPriorityFeePerGas,
                gasLimit,
                gasPrice,
                privateKey: currentWIF,
                nonce: this.customNonce ?? this.nonceInfo.nonce,
                fromAddress: from,
              });
            }
            txid = res.hash;
          }
          break;
      }
      if (
        this.data.from !== this.data.to.address ||
        this.data.chainType === 'NeoX'
      ) {
        const txTarget: Transaction = {
          txid,
          value: `-${this.data.amount}`,
          block_time: Math.floor(new Date().getTime() / 1000),
          from: [this.data.from],
          to: [this.data.to.address],
          type: 'sent',
          asset_id: '',
        };
        if (this.data.isNFT) {
          txTarget.tokenid = this.data.nftToken.tokenid;
          txTarget.asset_id = this.data.nftAsset.assethash;
        } else {
          txTarget.symbol = this.data.asset.symbol;
          txTarget.asset_id =
            this.data.asset.asset_id !== ETH_SOURCE_ASSET_HASH
              ? this.data.asset.asset_id
              : undefined;
        }
        if (this.data.chainType === 'NeoX') {
          txTarget.nonce = this.customNonce ?? this.nonceInfo.nonce;
        }
        this.pushTransaction(txTarget);
      }
      // todo transfer done
      this.global.log('transfer done', 'res');
      this.dialog
        .open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        })
        .afterClosed()
        .subscribe(() => {
          history.go(-1);
        });
    } catch (err) {
      switch (this.data.chainType) {
        case 'Neo2':
          this.global.handlePrcError(err, 'Neo2');
          break;
        case 'Neo3':
          this.global.handlePrcError(err, 'Neo3');
          break;
        case 'NeoX':
          this.global.snackBarTip(err);
          break;
      }
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
    this.rate.total = new BigNumber(this.rate.amount ?? 0)
      .plus(totalFeeRate ?? 0)
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

    // get nonce
    if (this.data.chainType === 'NeoX') {
      this.assetEvmState.getNonceInfo(this.data.from).then((res) => {
        this.nonceInfo = res;
      });
    }

    // EVM: get data
    if (
      this.data.chainType === 'NeoX' &&
      !this.data.isNFT &&
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
      this.evmHexDataLength = this.util.getHexDataLength(this.evmHexData);
    } else if (this.data.chainType === 'NeoX' && this.data.isNFT) {
      this.evmHexData = this.evmNFTState.getTransferData({
        asset: this.data.nftAsset,
        token: this.data.nftToken,
        fromAddress: this.data.from,
        toAddress: this.data.to.address,
      });
      this.evmHexDataLength = this.util.getHexDataLength(this.evmHexData);
    }
  }
  //#endregion

  //#region rate
  private async getGasRate(value: string) {
    if (!this.gasPrice) {
      this.gasPrice = await this.assetState.getAssetRateV2(
        this.data.chainType,
        this.data.chainType === 'Neo2'
          ? GAS
          : this.data.chainType === 'Neo3'
          ? GAS3_CONTRACT
          : ETH_SOURCE_ASSET_HASH,
        this.data.chainType === 'NeoX' ? this.data.network.chainId : undefined
      );
    }
    return this.gasPrice ? this.gasPrice.times(value).toFixed(2) : undefined;
  }
  //#endregion
}
