import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GAS, Asset, NftToken, NftAsset } from '@/models/models';
import {
  AssetState,
  GlobalService,
  ChromeService,
  NftState,
  UtilServiceState,
  AssetEVMState,
} from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import {
  PopupAssetListDialogComponent,
  PopupEditFeeDialogComponent,
} from '../../../_dialogs';
import { bignumber } from 'mathjs';
import { GasFeeSpeed, RpcNetwork } from '../../../_lib/type';
import { Neo3TransferService } from '../../neo3-transfer.service';
import { GAS3_CONTRACT, ChainType } from '../../../_lib';
import { forkJoin } from 'rxjs';
import BigNumber from 'bignumber.js';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { NeoXFeeInfoProp, TransferData } from '../interface';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '@/app/popup/_lib/evm';

interface TransferTo {
  address: string;
  name: string;
}

@Component({
  selector: 'transfer-create-amount',
  templateUrl: 'create-amount.component.html',
  styleUrls: ['create-amount.component.scss'],
})
export class TransferCreateAmountComponent implements OnInit, OnDestroy {
  @Output() closeEvent = new EventEmitter();
  private gasFeeSpeed: GasFeeSpeed;
  transferTo: TransferTo;
  assetArr: Asset[] = [];
  transferAsset: Asset;
  nftContract: string;
  nftAsset: NftAsset;
  transferNFT: NftToken;

  transferAmount = '';
  private isTransferAllLoading = false;
  private isTransferAll = false;
  priorityFee = '0';
  gasBalance = '0'; // GAS || GAS3_CONTRACT || ETH_SOURCE_ASSET_HASH

  // EVM
  neoXFeeInfo: NeoXFeeInfoProp;

  private accountSub: Unsubscribable;
  fromAddress: string;
  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  chainType: ChainType;
  currentNetwork: RpcNetwork;
  currentWalletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
  private currentWIF: string;
  constructor(
    private aRoute: ActivatedRoute,
    private asset: AssetState,
    private dialog: MatDialog,
    private global: GlobalService,
    private chrome: ChromeService,
    private neo3Transfer: Neo3TransferService,
    private nftState: NftState,
    private util: UtilServiceState,
    private assetEVMState: AssetEVMState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.fromAddress = state.currentWallet?.accounts[0]?.address;
      switch (this.chainType) {
        case 'Neo2':
          this.currentWalletArr = state.neo2WalletArr;
          this.currentNetwork = state.n2Networks[state.n2NetworkIndex];
          this.getCurrentWIF(state.neo2WIFArr);
          break;
        case 'Neo3':
          this.currentWalletArr = state.neo3WalletArr;
          this.currentNetwork = state.n3Networks[state.n3NetworkIndex];
          this.getCurrentWIF(state.neo3WIFArr);
          break;
        case 'NeoX':
          this.currentWalletArr = state.neoXWalletArr;
          this.currentNetwork = state.neoXNetworks[state.neoXNetworkIndex];
          this.getCurrentWIF([]);
          break;
      }
      this.initData();
    });
  }

  //#region init
  private getCurrentWIF(WIFArr: string[]) {
    this.util
      .getWIF(WIFArr, this.currentWalletArr, this.currentWallet)
      .then((res) => (this.currentWIF = res));
  }
  private initData() {
    this.aRoute.params.subscribe((params) => {
      if (params.nftContract) {
        this.nftContract = params.nftContract;
        this.getNftTokens();
        const gasAssetId =
          this.chainType === 'Neo2'
            ? GAS
            : this.chainType === 'Neo3'
            ? GAS3_CONTRACT
            : ETH_SOURCE_ASSET_HASH;
        this.asset
          .getAddressAssetBalance(this.fromAddress, gasAssetId, this.chainType)
          .then((res) => {
            if (this.chainType === 'NeoX') {
              this.gasBalance = new BigNumber(res).shiftedBy(-18).toFixed();
            } else {
              this.gasBalance = new BigNumber(res).shiftedBy(-8).toFixed();
            }
          });
      } else {
        this.getAddressAllBalances(params);
      }
    });
  }
  private getNftTokens() {
    if (this.chainType === 'Neo3') {
      this.nftState
        .getNftTokens(this.fromAddress, this.nftContract)
        .then((res) => {
          this.nftAsset = res;
          this.transferNFT = this.nftAsset.tokens[0];
        });
    }
    if (this.chainType === 'NeoX') {
      this.chrome
        .getNftWatch(
          `${this.chainType}-${this.currentNetwork.id}`,
          this.currentWallet.accounts[0].address
        )
        .subscribe((watch) => {
          this.nftAsset = watch.find(
            (item) => item.assethash === this.nftContract
          );
          this.transferNFT = this.nftAsset.tokens.find((item) => item.isOwner);
        });
    }
  }
  private async getAddressAllBalances(params) {
    const getMoneyBalance = this.asset.getAddressBalances(this.fromAddress);
    const getWatch = this.chrome.getWatch(
      `${this.chainType}-${this.currentNetwork.id}`,
      this.fromAddress
    );
    forkJoin([getMoneyBalance, getWatch]).subscribe(
      async ([moneyAssets, watch]) => {
        const showAssets = [...moneyAssets];
        for (const item of watch) {
          const index = moneyAssets.findIndex(
            (m) => m.asset_id === item.asset_id
          );
          if (index >= 0) {
            if (item.watching === false) {
              showAssets.splice(index, 1);
            }
          } else {
            if (item.watching === true) {
              const balance = await this.asset.getAddressAssetBalance(
                this.fromAddress,
                item.asset_id,
                this.chainType
              );
              if (new BigNumber(balance).comparedTo(0) > 0) {
                item.balance = new BigNumber(balance)
                  .shiftedBy(-item.decimals)
                  .toFixed();
                showAssets.push(item);
              }
            }
          }
        }
        const gasAssetId =
          this.chainType === 'Neo2'
            ? GAS
            : this.chainType === 'Neo3'
            ? GAS3_CONTRACT
            : ETH_SOURCE_ASSET_HASH;
        const gasAsset = showAssets.find((m) => m.asset_id === gasAssetId);
        this.gasBalance = gasAsset?.balance || '0';
        this.assetArr = showAssets;
        if (!params.id) {
          this.transferAsset = this.assetArr[0];
        } else {
          const findAsset = showAssets.find((m) => m.asset_id === params.id);
          this.transferAsset = findAsset ?? showAssets[0];
        }
      }
    );
  }
  //#endregion

  ngOnInit(): void {
    if (this.chainType !== 'NeoX') {
      this.getGasFeeSpeed();
    }
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  // region transfer to address
  selectAccount(w: TransferTo) {
    this.transferTo = w;
  }

  // transfer asset
  selectAsset(isNFT = false) {
    let tokens;
    if (isNFT) {
      tokens = this.nftAsset.tokens;
    }
    if (isNFT && this.chainType === 'NeoX') {
      tokens = tokens.filter((item) => item.isOwner === true);
    }

    this.dialog
      .open(PopupAssetListDialogComponent, {
        data: {
          isNft: isNFT,
          chainType: this.chainType,
          networkId: this.currentNetwork.id,
          balances: isNFT ? tokens : this.assetArr,
          selectedId: isNFT
            ? this.transferNFT.tokenid
            : this.transferAsset.asset_id,
        },
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          if (isNFT) {
            this.transferNFT = res;
          } else {
            this.transferAsset = res;
            this.transferAmount = '';
          }
        }
      });
  }

  //#region amount
  checkTransferAmount(event) {
    this.isTransferAll = false;
    const value = event.target.value;
    const regex = new RegExp(
      `^\\D*(\\d*(?:\\.\\d{0,${this.transferAsset.decimals}})?).*`,
      'g'
    );
    event.target.value = value.replace(regex, '$1');
  }
  transferAll() {
    if (this.isTransferAllLoading || !this.transferAsset) {
      return;
    }
    this.isTransferAll = true;
    this.isTransferAllLoading = true;
    // 不是 GAS 资产时
    if (
      this.transferAsset.asset_id !== GAS &&
      this.transferAsset.asset_id !== GAS3_CONTRACT &&
      this.transferAsset.asset_id !== ETH_SOURCE_ASSET_HASH
    ) {
      this.transferAmount = this.transferAsset.balance;
      this.isTransferAllLoading = false;
      return;
    }
    if (this.chainType === 'NeoX') {
      const tAmount = new BigNumber(this.transferAsset.balance).minus(
        this.neoXFeeInfo?.estimateGas.toString() || 0
      );
      if (tAmount.comparedTo(0) > 0) {
        this.transferAmount = tAmount.toFixed(this.transferAsset.decimals, 1);
      } else {
        this.global.snackBarTip('balanceLack');
      }
      this.isTransferAllLoading = false;
      return;
    }
    const tAmount = bignumber(this.transferAsset.balance).minus(
      this.priorityFee
    );
    let tempAmount;
    if (tAmount.comparedTo(0) <= 0) {
      this.priorityFee = '0'; // 优先费大于全部资产时，小费重设为0
      tempAmount = this.transferAsset.balance;
    } else {
      tempAmount = tAmount.toFixed(this.transferAsset.decimals, 1);
    }
    // neo2 的 GAS
    if (this.transferAsset.asset_id === GAS) {
      this.transferAmount = tempAmount;
      this.isTransferAllLoading = false;
      return;
    }
    // neo3 的GAS
    const param = {
      addressFrom: this.fromAddress,
      addressTo: this.fromAddress,
      tokenScriptHash: this.transferAsset.asset_id,
      amount: tempAmount,
      networkFee: this.priorityFee,
      decimals: this.transferAsset.decimals,
    };
    this.neo3Transfer.createNeo3Tx(param, true).subscribe(
      (tx) => {
        this.transferAmount = bignumber(this.transferAsset.balance)
          .minus(tx.networkFee.toDecimal(8))
          .minus(tx.systemFee.toDecimal(8))
          .toString();
        this.isTransferAllLoading = false;
      },
      () => {
        this.isTransferAllLoading = false;
      }
    );
  }
  //#endregion

  //#region NEO gas fee
  editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          fee: this.priorityFee,
          speedFee: this.gasFeeSpeed,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res !== false) {
          this.priorityFee = res;
        }
      });
  }
  getPriorityFeeDesc() {
    if (this.priorityFee && this.gasFeeSpeed) {
      if (this.priorityFee === this.gasFeeSpeed.slow_price) {
        return 'slow';
      } else if (this.priorityFee === this.gasFeeSpeed.propose_price) {
        return 'medium';
      } else if (this.priorityFee === this.gasFeeSpeed.fast_price) {
        return 'fast';
      } else {
        return 'customize';
      }
    }
    return 'customize';
  }
  private getGasFeeSpeed() {
    this.asset.getGasFee().subscribe((res: GasFeeSpeed) => {
      this.gasFeeSpeed = res;
      this.priorityFee = res.propose_price;
    });
  }
  //#endregion

  updateEvmFee($event) {
    this.neoXFeeInfo = $event;
    // isTransferAll: Recalculate transferAmount
    if (
      this.isTransferAll &&
      this.transferAsset.asset_id === ETH_SOURCE_ASSET_HASH
    ) {
      const tAmount = new BigNumber(this.transferAsset.balance).minus(
        this.neoXFeeInfo?.estimateGas.toString() || 0
      );
      this.transferAmount =
        tAmount.comparedTo(0) > 0
          ? tAmount.toFixed(this.transferAsset.decimals, 1)
          : '';
    }
  }

  cancel() {
    history.go(-1);
  }

  public submit() {
    if (this.chainType === 'NeoX' && !this.neoXFeeInfo) return;

    if (
      (this.chainType !== 'NeoX' &&
        bignumber(this.priorityFee).comparedTo(this.gasBalance) > 0) ||
      (this.chainType === 'NeoX' &&
        bignumber(this.neoXFeeInfo.estimateGas).comparedTo(this.gasBalance) > 0)
    ) {
      this.global.snackBarTip('InsufficientGas');
      return;
    }

    if (!this.nftContract) {
      try {
        bignumber(this.transferAmount);
      } catch (error) {
        this.global.snackBarTip('checkInput');
        return;
      }

      let requiredAmount = bignumber(this.transferAmount);
      if (
        this.transferAsset.asset_id === GAS ||
        this.transferAsset.asset_id === GAS3_CONTRACT ||
        this.transferAsset.asset_id === ETH_SOURCE_ASSET_HASH
      ) {
        if (this.chainType === 'NeoX') {
          requiredAmount = requiredAmount.plus(this.neoXFeeInfo?.estimateGas);
        } else {
          requiredAmount = requiredAmount.plus(this.priorityFee);
        }
      }
      if (
        requiredAmount.comparedTo(bignumber(this.transferAsset.balance)) > 0
      ) {
        this.global.snackBarTip('balanceLack');
        return;
      }
    }

    const data: TransferData = {
      from: this.fromAddress,
      to: this.transferTo,
      asset: this.transferAsset,
      nftToken: this.transferNFT,
      nftAsset: this.nftAsset,
      amount: this.nftContract ? '1' : this.transferAmount,
      fee: this.priorityFee,
      gasBalance: this.gasBalance,
      chainType: this.chainType,
      isNFT: this.nftContract ? true : false,
      nftContract: this.nftContract,
      network: this.currentNetwork,
      currentWallet: this.currentWallet,
      currentWIF: this.currentWIF,
      neoXFeeInfo: this.neoXFeeInfo,
    };
    this.closeEvent.emit(data);
    return;
  }
}
