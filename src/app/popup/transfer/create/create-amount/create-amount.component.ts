import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GAS, Asset, NftToken } from '@/models/models';
import {
  AssetState,
  GlobalService,
  ChromeService,
  NftState,
  UtilServiceState,
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
import { TransferData } from '../interface';

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
  nftTokens: NftToken[] = [];
  transferNFT: NftToken;

  transferAmount = '';
  istransferAll = false;
  priorityFee = '0';
  loading = false;
  gasBalance = '0';

  private accountSub: Unsubscribable;
  private fromAddress: string;
  private currentWallet: Wallet2 | Wallet3;
  chainType: ChainType;
  currentNetwork: RpcNetwork;
  currentWalletArr: Array<Wallet2 | Wallet3>;
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
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.fromAddress = state.currentWallet?.accounts[0]?.address;
      this.currentWalletArr =
        this.chainType === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
      this.currentNetwork =
        this.chainType === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : state.n3Networks[state.n3NetworkIndex];
      this.getCurrentWIF(
        this.chainType === 'Neo2' ? state.neo2WIFArr : state.neo3WIFArr
      );
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
        const gasAssetId = this.chainType === 'Neo2' ? GAS : GAS3_CONTRACT;
        this.asset
          .getAddressAssetBalance(this.fromAddress, gasAssetId, this.chainType)
          .then((res) => {
            this.gasBalance = new BigNumber(res).shiftedBy(-8).toFixed();
          });
      } else {
        if (params.id) {
          this.asset
            .getAssetDetail(this.fromAddress, params.id)
            .then(async (res: Asset) => {
              res.balance = bignumber(res.balance).toFixed();
              this.transferAsset = res;
            });
        }
        this.getAddressAllBalances(params);
      }
    });
  }
  private getNftTokens() {
    this.nftState
      .getNftTokens(this.fromAddress, this.nftContract)
      .then((res) => {
        this.nftTokens = res.tokens;
        this.transferNFT = this.nftTokens[0];
      });
  }
  private async getAddressAllBalances(params) {
    const getMoneyBalance = this.asset.getAddressBalances(this.fromAddress);
    const getWatch = this.chrome.getWatch(
      this.currentNetwork.id,
      this.fromAddress
    );
    forkJoin([getMoneyBalance, getWatch]).subscribe((res) => {
      const [moneyAssets, watch] = [...res];
      const showAssets = [...moneyAssets];
      watch.forEach(async (item) => {
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
              const decimals = await this.util.getAssetDecimals(
                [item.asset_id],
                this.chainType
              );
              item.balance = new BigNumber(balance)
                .shiftedBy(-decimals[0])
                .toFixed();
              showAssets.push(item);
            }
          }
        }
      });
      const gasAssetId = this.chainType === 'Neo2' ? GAS : GAS3_CONTRACT;
      const gasAsset = showAssets.find((m) => m.asset_id === gasAssetId);
      this.gasBalance = gasAsset?.balance || '0';
      this.assetArr = showAssets;
      if (!params.id) {
        this.transferAsset = this.assetArr[0];
      }
    });
  }
  //#endregion

  ngOnInit(): void {
    this.getGasFeeSpeed();
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
    this.dialog
      .open(PopupAssetListDialogComponent, {
        data: {
          isNft: isNFT,
          balances: isNFT ? this.nftTokens : this.assetArr,
          selectedId: isNFT
            ? this.transferNFT.tokenid
            : this.transferAsset.asset_id,
        },
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          if (isNFT) {
            this.transferNFT = res;
          } else {
            this.transferAsset = res;
          }
        }
      });
  }

  //#region amount
  checkTransferAmount(event) {
    const inputStr = String.fromCharCode(event.keyCode);
    let re = /^[0-9\.]+$/;
    if (
      this.transferAmount !== undefined &&
      this.transferAmount.indexOf('.') >= 0
    ) {
      re = /^[0-9]+$/;
    }
    if (!re.test(inputStr)) {
      return false;
    }
  }
  transferAll() {
    if (this.istransferAll) {
      return;
    }
    this.istransferAll = true;
    // 不是 GAS 资产时
    if (
      this.transferAsset.asset_id !== GAS &&
      this.transferAsset.asset_id !== GAS3_CONTRACT
    ) {
      this.transferAmount = this.transferAsset.balance;
      this.istransferAll = false;
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
      tempAmount = tAmount.toString();
    }
    // neo2 的 GAS
    if (this.transferAsset.asset_id === GAS) {
      this.transferAmount = tempAmount;
      this.istransferAll = false;
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
    this.loading = true;
    this.neo3Transfer.createNeo3Tx(param, true).subscribe(
      (tx) => {
        this.transferAmount = bignumber(this.transferAsset.balance)
          .minus(tx.networkFee.toDecimal(8))
          .minus(tx.systemFee.toDecimal(8))
          .toString();
        this.loading = false;
        this.istransferAll = false;
      },
      () => {
        this.loading = false;
        this.istransferAll = false;
      }
    );
  }
  //#endregion

  //#region gas fee
  editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
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
    if (this.asset.gasFeeSpeed) {
      this.gasFeeSpeed = this.asset.gasFeeSpeed;
      this.priorityFee = this.asset.gasFeeSpeed.propose_price;
    } else {
      this.asset.getGasFee().subscribe((res: GasFeeSpeed) => {
        this.gasFeeSpeed = res;
        this.priorityFee = res.propose_price;
      });
    }
  }
  //#endregion

  cancel() {
    history.go(-1);
  }

  public submit() {
    if (bignumber(this.priorityFee).comparedTo(this.gasBalance) > 0) {
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
        this.transferAsset.asset_id === GAS3_CONTRACT
      ) {
        requiredAmount = requiredAmount.plus(this.priorityFee);
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
      amount: this.nftContract ? '1' : this.transferAmount,
      fee: this.priorityFee,
      gasBalance: this.gasBalance,
      chainType: this.chainType,
      isNFT: this.nftContract ? true : false,
      nftContract: this.nftContract,
      network: this.currentNetwork,
      currentWallet: this.currentWallet,
      currentWIF: this.currentWIF,
    };
    this.closeEvent.emit(data);
    return;
  }
}
