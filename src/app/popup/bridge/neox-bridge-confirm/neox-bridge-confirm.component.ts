import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import {
  GlobalService,
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
  RpcNetwork,
} from '../../_lib';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '@/app/popup/_lib/evm';
import { NeoXFeeInfoProp } from '../../transfer/create/interface';
import { ethers } from 'ethers';
import { getHexDataLength } from '@/app/core/utils/evm';

export type TabType = 'details' | 'data';

@Component({
  selector: 'neox-bridge-confirm',
  templateUrl: 'neox-bridge-confirm.component.html',
  styleUrls: ['../bridge-confirm.scss'],
})
export class NeoXBridgeConfirmComponent implements OnInit {
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
  confirmNewParams;
  private confirmPreExecutionParams;
  showHardwareSign = false;
  rate = { fee: '', total: '' };

  constructor(
    private global: GlobalService,
    private assetState: AssetState,
    private chrome: ChromeService,
    private assetEVMState: AssetEVMState
  ) {}

  ngOnInit(): void {
    this.calculateTotalAmount();
    this.hexDataLength = getHexDataLength(this.txParams.data);
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
    const { newParams, PreExecutionParams } = this.assetEVMState.getTxParams(
      this.txParams,
      this.neoXFeeInfo,
      this.customNonce ?? this.nonceInfo.nonce,
      this.txParams.from
    );
    this.confirmNewParams = newParams;
    this.confirmPreExecutionParams = PreExecutionParams;
    delete this.confirmNewParams.from;
    if (this.currentWallet.accounts[0].extra.ledgerSLIP44) {
      this.showHardwareSign = true;
      return;
    }

    this.loading = true;
    const pwd = await this.chrome.getPassword();
    const wallet = await ethers.Wallet.fromEncryptedJson(
      JSON.stringify(this.currentWallet),
      pwd
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

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.ledgerSendTx(tx, this.confirmPreExecutionParams);
    }
  }
}
