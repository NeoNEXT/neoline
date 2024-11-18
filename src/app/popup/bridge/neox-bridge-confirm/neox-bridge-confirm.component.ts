import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {
  GlobalService,
  LedgerService,
  UtilServiceState,
  ChromeService,
  AssetEVMState,
  AssetState,
} from '@/app/core';
import { BigNumber } from 'bignumber.js';
import { Asset } from '@/models/models';
import {
  AddressNonceInfo,
  ChainType,
  EvmTransactionParams,
  LedgerStatuses,
  RpcNetwork,
} from '../../_lib';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '@/app/popup/_lib/evm';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import { ethers } from 'ethers';
import { interval } from 'rxjs';

export type TabType = 'details' | 'data';

@Component({
  selector: 'neox-bridge-confirm',
  templateUrl: 'neox-bridge-confirm.component.html',
  styleUrls: ['../bridge-confirm.scss'],
})
export class NeoXBridgeConfirmComponent implements OnInit, OnDestroy {
  ETH_SOURCE_ASSET_HASH = ETH_SOURCE_ASSET_HASH;
  @Input() bridgeAsset: Asset;
  @Input() bridgeAmount: string;
  @Input() toAddress: string;
  @Input() currentWallet: EvmWalletJSON;
  @Input() neoXFeeInfo: NeoXFeeInfoProp;
  @Input() txParams: EvmTransactionParams;
  @Input() neoXNetwork: RpcNetwork;
  @Input() rateCurrency: string;

  @Output() backAmount = new EventEmitter<{ hash: string; chain: ChainType }>();

  tabType: TabType = 'details';
  totalAmount: string;
  hexDataLength: number;
  nonceInfo: AddressNonceInfo;
  customNonce: number;
  insufficientFunds = false;

  loading = false;
  loadingMsg: string;
  getStatusInterval;
  rate = { fee: '', total: '' };

  constructor(
    private global: GlobalService,
    private ledger: LedgerService,
    private util: UtilServiceState,
    private assetState: AssetState,
    private chrome: ChromeService,
    private assetEVMState: AssetEVMState
  ) {}

  ngOnInit(): void {
    this.calculateTotalAmount();
    this.hexDataLength = this.util.getHexDataLength(this.txParams.data);
    this.assetEVMState
      .getNonceInfo(this.currentWallet.accounts[0].address)
      .then((res) => {
        this.nonceInfo = res;
      });
  }

  private calculateTotalAmount() {
    if (this.bridgeAsset.asset_id === ETH_SOURCE_ASSET_HASH) {
      this.totalAmount = new BigNumber(this.bridgeAmount)
        .plus(this.neoXFeeInfo.estimateGas)
        .toFixed();
      this.assetState
        .getAssetRateV2(
          'NeoX',
          this.bridgeAsset.asset_id,
          this.neoXNetwork.chainId
        )
        .then((res) => {
          if (res) {
            this.rate.fee = res.times(this.neoXFeeInfo.estimateGas).toFixed(2);
            this.rate.total = res.times(this.totalAmount).toFixed(2);
          }
        });
    } else {
      ethers
        .resolveProperties({
          gasRate: this.assetState.getAssetRateV2(
            'NeoX',
            ETH_SOURCE_ASSET_HASH,
            this.neoXNetwork.chainId
          ),
          bridgeAssetRate: this.assetState.getAssetRateV2(
            'NeoX',
            this.bridgeAsset.asset_id,
            this.neoXNetwork.chainId
          ),
        })
        .then(({ gasRate, bridgeAssetRate }) => {
          if (gasRate) {
            this.rate.fee = gasRate
              .times(this.neoXFeeInfo.estimateGas)
              .toFixed(2);
          }
          if (gasRate && bridgeAssetRate) {
            const totalAmountValue = bridgeAssetRate.times(this.bridgeAmount);
            this.rate.total = totalAmountValue.plus(this.rate.fee).toFixed(2);
          }
        });
    }
    this.checkBalance();
  }

  private checkBalance() {
    if (
      new BigNumber(this.totalAmount).comparedTo(this.bridgeAsset.balance) > 0
    ) {
      this.insufficientFunds = true;
    } else {
      this.insufficientFunds = false;
    }
  }

  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  back() {
    this.backAmount.emit();
  }

  cancel() {
    history.go(-1);
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.calculateTotalAmount();
  }

  changeNonce($event) {
    this.customNonce = $event;
  }

  async confirm() {
    this.loading = true;

    if (this.currentWallet.accounts[0].extra.ledgerSLIP44) {
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus();
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus();
      });
      return;
    }

    const pwd = await this.chrome.getPassword();
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(this.currentWallet),
      pwd
    );

    const { newParams, PreExecutionParams } = this.assetEVMState.getTxParams(
      this.txParams,
      this.neoXFeeInfo,
      this.customNonce ?? this.nonceInfo.nonce,
      this.txParams.from
    );
    this.assetEVMState
      .sendDappTransaction(PreExecutionParams, newParams, wallet.privateKey)
      .then((tx) => {
        this.backAmount.emit({ hash: tx.hash, chain: 'NeoX' });
        this.loading = false;
      })
      .catch((error) => {
        this.loading = false;
        this.global.snackBarTip(error);
      });
  }

  private ledgerSendTx(signedTx, PreExecutionParams) {
    this.assetEVMState
      .sendTransactionByRPC(signedTx, PreExecutionParams)
      .then((txHash) => {
        this.backAmount.emit({ hash: txHash, chain: 'NeoX' });
        this.loading = false;
      })
      .catch((error) => {
        this.loading = false;
        this.global.snackBarTip(error);
      });
  }

  private getLedgerStatus() {
    this.ledger.getDeviceStatus('NeoX').then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msgNeoX || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';

        const { newParams, PreExecutionParams } =
          this.assetEVMState.getTxParams(
            this.txParams,
            this.neoXFeeInfo,
            this.customNonce ?? this.nonceInfo.nonce,
            this.txParams.from
          );
        delete newParams.from;
        this.ledger
          .getLedgerSignedTx(newParams as any, this.currentWallet, 'NeoX')
          .then((tx) => {
            this.loading = false;
            this.ledgerSendTx(tx, PreExecutionParams);
          })
          .catch((error) => {
            this.loading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }
}
