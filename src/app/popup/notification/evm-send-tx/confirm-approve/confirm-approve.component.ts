import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {
  EvmAssetService,
  EvmDappService,
  EvmTxService,
  GoPlusService,
} from '@/app/core';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import {
  AddressNonceInfo,
  EvmTransactionParams,
  RpcNetwork,
  TokenStandard,
} from '@/app/popup/_lib';
import { NeoXFeeInfoProp } from '@/app/popup/transfer/create/interface';
import { ethers } from 'ethers';
import { RateType } from '../evm-send-tx.component';
import { PopupEditApproveCapDialogComponent } from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';
import {
  detectContractSecurityToThirdPartySite,
  getHexDataLength,
} from '@/app/core/utils/evm';
import {
  EvmAuthorizationDetails,
  getTransactionAuthorizations,
} from '@/app/core/utils/evm-authorization';

type TabType = 'details' | 'data';

@Component({
  selector: 'confirm-approve',
  templateUrl: './confirm-approve.component.html',
  styleUrls: ['../send-common.scss', './confirm-approve.component.scss'],
})
export class PopupNoticeEvmConfirmApproveComponent implements OnInit {
  @Input() lang = 'en';
  @Input() locationOrigin: string;
  @Input() iconSrc: string;
  @Input() txParams: EvmTransactionParams;
  @Input() siteNeoXFeeInfo: NeoXFeeInfoProp;
  @Input() signAddressGasBalance: string;
  @Input() encryptWallet: EvmWalletJSON;
  @Input() estimateGasError: boolean;
  @Input() insufficientFunds: boolean;
  @Input() nonceInfo: AddressNonceInfo;
  @Input() rate: RateType;

  @Input() neoXNetwork: RpcNetwork;
  @Output() closeEvent = new EventEmitter();
  @Output() updateFeeEvent = new EventEmitter<NeoXFeeInfoProp>();
  @Output() updateApproveAmountEvent = new EventEmitter<EvmTransactionParams>();
  @Output() confirmEvent = new EventEmitter();
  @Output() returnAssetDetail = new EventEmitter();

  customNonce: number;
  tabType: TabType = 'details';
  hexDataLength: number;
  assetDetails;
  tokenData;
  approveAmount = '';
  newTxParams: EvmTransactionParams;
  approveAssetBalance: string;
  neoXFeeInfo: NeoXFeeInfoProp;
  authorizations: EvmAuthorizationDetails[] = [];
  canEditApproveAmount = false;
  constructor(
    private evmDappService: EvmDappService,
    private evmTxService: EvmTxService,
    private evmAssetService: EvmAssetService,
    private dialog: MatDialog,
    private goPlusService: GoPlusService
  ) {}

  ngOnInit(): void {
    this.hexDataLength = getHexDataLength(this.txParams.data);
    this.tokenData = this.evmDappService.parseStandardTokenTransactionData(
      this.txParams.data
    );
    this.authorizations = getTransactionAuthorizations(
      this.txParams,
      this.tokenData
    );
    this.evmDappService
      .getAssetDetails(
        this.txParams.to,
        this.txParams.from,
        this.txParams.data,
        null
      )
      .then((res) => {
        this.assetDetails = res;
        this.returnAssetDetail.emit(this.assetDetails);
        this.approveAmount = this.assetDetails.tokenAmount || '';
        this.authorizations = getTransactionAuthorizations(
          this.txParams,
          this.tokenData,
          this.assetDetails
        );
        this.canEditApproveAmount =
          this.tokenData?.name?.toLowerCase() === 'approve' &&
          this.assetDetails.standard === TokenStandard.ERC20 &&
          this.authorization?.approved !== false;

        if (this.canEditApproveAmount) {
          this.evmAssetService
            .getNeoXAddressAssetBalance(this.txParams.from, this.txParams.to)
            .then((res) => {
              this.approveAssetBalance = ethers.formatUnits(
                res,
                this.assetDetails.decimals
              );
            });
        }
      });
  }

  get authorization(): EvmAuthorizationDetails | undefined {
    return this.authorizations[0];
  }

  get isNftAuthorization(): boolean {
    return (
      this.authorization?.scope === 'token' ||
      this.authorization?.scope === 'allNfts'
    );
  }

  get isNftApprove(): boolean {
    return this.authorization?.kind === 'approve' && this.isNftAuthorization;
  }

  get isApproveAndCall(): boolean {
    return this.authorization?.kind === 'approveAndCall';
  }

  get isSetApprovalForAll(): boolean {
    return this.authorization?.kind === 'setApprovalForAll';
  }

  get isRevokeApprovalForAll(): boolean {
    return this.isSetApprovalForAll && this.authorization?.approved === false;
  }

  get isRevokeApproval(): boolean {
    return (
      this.authorization?.approved === false &&
      (this.authorization.kind === 'approve' ||
        this.authorization.kind === 'approveAndCall' ||
        this.authorization.kind === 'setApprovalForAll')
    );
  }

  get showAuthorizationPreview(): boolean {
    if (!this.authorization) {
      return false;
    }
    if (this.authorization.kind === 'approve') {
      return this.canEditApproveAmount || this.isNftApprove || this.isRevokeApproval;
    }
    return true;
  }

  get authorizationTitleKey(): string {
    if (this.isRevokeApproval) {
      return 'revokePermission';
    }
    if (this.isNftAuthorization) {
      return 'nftWithdrawalRequest';
    }
    return 'SpendingCapRequest';
  }

  get authorizationDescriptionKey(): string {
    if (this.isRevokeApprovalForAll) {
      return 'authorizationNftRevokeApprovalForAllDescription';
    }
    if (this.isRevokeApproval) {
      if (this.isNftAuthorization) {
        return 'authorizationNftRevokeApprovalDescription';
      }
      return 'authorizationErc20RevokeDescription';
    }
    if (this.authorization?.unlimited) {
      return 'authorizationErc20UnlimitedDescription';
    }
    if (this.isApproveAndCall) {
      return 'authorizationApproveAndCallDescription';
    }
    if (this.isSetApprovalForAll) {
      return 'authorizationNftApprovalForAllDescription';
    }
    if (this.isNftApprove) {
      return 'authorizationNftApproveDescription';
    }
    return 'authorizationErc20ApproveDescription';
  }

  get authorizationChangeLabelKey(): string {
    if (this.isRevokeApproval && !this.isNftAuthorization) {
      return 'SpendingCap';
    }
    if (this.canEditApproveAmount || this.isApproveAndCall) {
      return 'SpendingCap';
    }
    if (this.isRevokeApproval) {
      return 'NFT';
    }
    return 'withdraw';
  }

  get showSpenderInfo(): boolean {
    return (
      Boolean(this.authorization?.spender) &&
      !this.isRevokeApproval
    );
  }

  get spenderInfoLabelKey(): string {
    return this.isSetApprovalForAll ? 'permissionFor' : 'Spender';
  }

  get assetDisplayName(): string {
    return (
      this.assetDetails?.name ||
      this.assetDetails?.symbol ||
      this.txParams?.to ||
      ''
    );
  }

  get authorizationAmountDisplay(): string {
    if (this.authorization?.unlimited) {
      return 'unlimited';
    }
    if (this.isRevokeApproval && !this.isNftAuthorization) {
      return '0';
    }
    return this.approveAmount || this.authorization?.amount || '';
  }

  get methodDisplayName(): string {
    const method = this.tokenData?.name || '';
    const normalizedMethod = method.toLowerCase();
    if (normalizedMethod === 'approve') {
      return 'Approve';
    }
    if (normalizedMethod === 'setapprovalforall') {
      return 'Set Approval For All';
    }
    if (normalizedMethod === 'approveandcall') {
      return 'Approve And Call';
    }
    return method;
  }

  get currentTxParams(): EvmTransactionParams {
    return this.newTxParams ?? this.txParams;
  }

  openEditApproveCapDialog() {
    this.dialog
      .open(PopupEditApproveCapDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          approveAssetBalance: this.approveAssetBalance,
          approveAmount: this.approveAmount,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.approveAmount = res;
          const newData = this.evmTxService.getApproveERC20Data({
            assetAddress: this.txParams.to,
            toAddress: this.assetDetails.toAddress,
            approveAmount: ethers.parseUnits(
              this.approveAmount,
              this.assetDetails.decimals
            ),
          });
          this.newTxParams = Object.assign({}, this.txParams, {
            data: newData,
          });
          this.tokenData = this.evmDappService.parseStandardTokenTransactionData(
            newData
          );
          this.hexDataLength = getHexDataLength(newData);
          this.authorizations = getTransactionAuthorizations(
            this.newTxParams,
            this.tokenData,
            { ...this.assetDetails, tokenAmount: this.approveAmount }
          );
          this.updateApproveAmountEvent.emit(this.newTxParams);
        }
      });
  }

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    this.updateFeeEvent.emit($event);
  }

  exit() {
    this.closeEvent.emit();
  }

  confirm() {
    this.confirmEvent.emit(this.customNonce);
  }

  changeNonce($event) {
    this.customNonce = $event;
  }

  get goPlusSupported(): boolean {
    return this.goPlusService.isSupportedChain(this.neoXNetwork?.chainId);
  }

  detectContractSecurity() {
    detectContractSecurityToThirdPartySite(
      this.neoXNetwork.chainId,
      this.txParams.to
    );
  }
}
