import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AssetState,
  GlobalService,
  ChromeService,
  TransactionState,
  SettingState,
  Neo3Service,
  NeoAssetInfoState,
} from '@/app/core';
import { NEO, GAS, Asset } from '@/models/models';
import { tx as tx2, u } from '@cityofzion/neon-js';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { ERRORS, requestTarget, TxHashAttribute } from '@/models/dapi';
import { MatDialog } from '@angular/material/dialog';
import {
  PopupEditFeeDialogComponent,
  PopupTransferSuccessDialogComponent,
} from '../../_dialogs';
import { bignumber } from 'mathjs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { STORAGE_NAME, ChainType } from '../../_lib';
import BigNumber from 'bignumber.js';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { TransferService } from '../../transfer/transfer.service';
import { parseNeo2TxHashAttr } from '@/app/core/utils/neo';

type TabType = 'details' | 'data';

@Component({
  templateUrl: 'transfer.component.html',
  styleUrls: ['transfer.component.scss'],
})
export class PopupNoticeTransferComponent implements OnInit {
  tabType: TabType = 'details';
  NEO = NEO;
  public dataJson: any = {};
  public rateCurrency = '';
  public txSerialize = '';
  public tx: Transaction;
  public money = '';
  public feeMoney = '0';
  public totalMoney = '';

  public balance: Asset;
  public creating = false;
  public toAddress: string = '';
  public assetId: string = '';
  public symbol: string = '';
  public amount: string = '0';
  public remark: string = '';
  public loading = false;
  public loadingMsg: string;
  showHardwareSign = false;
  unsignedTx;
  private txHashAttributes: TxHashAttribute[] = null;

  public fee: number;
  public init = false;
  private broadcastOverride = false;
  private messageID = 0;

  private accountSub: Unsubscribable;
  public fromAddress: string;
  public n2Network: RpcNetwork;
  currentWallet: Wallet2;
  chainType: ChainType;
  private neo2WIFArr: string[];
  private neo2WalletArr: Wallet2[];
  constructor(
    private aRoute: ActivatedRoute,
    private asset: AssetState,
    private transfer: TransferService,
    private global: GlobalService,
    private neo3Service: Neo3Service,
    private chrome: ChromeService,
    private txState: TransactionState,
    private dialog: MatDialog,
    private settingState: SettingState,
    private store: Store<AppState>,
    private neoAssetInfoState: NeoAssetInfoState
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet as Wallet2;
      this.fromAddress = state.currentWallet?.accounts[0]?.address;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.neo2WIFArr = state.neo2WIFArr;
      this.neo2WalletArr = state.neo2WalletArr;
    });
  }

  ngOnInit(): void {
    this.settingState.rateCurrencySub.subscribe((res) => {
      this.rateCurrency = res;
    });
    this.aRoute.queryParams.subscribe((params: any) => {
      const pramsData = JSON.parse(JSON.stringify(params));
      this.dataJson = JSON.stringify(params);
      this.messageID = params.messageID;
      if (JSON.stringify(params) === '{}') {
        return;
      }
      for (const key in pramsData) {
        if (Object.prototype.hasOwnProperty.call(pramsData, key)) {
          let tempObject: any;
          try {
            tempObject = pramsData[key]
              .replace(/([a-zA-Z0-9]+?):/g, '"$1":')
              .replace(/'/g, '"');
            tempObject = JSON.parse(tempObject);
          } catch (error) {
            tempObject = pramsData[key];
          }
          pramsData[key] = tempObject;
        }
      }
      this.dataJson = pramsData;
      this.dataJson.messageID = undefined;
      this.broadcastOverride =
        params.broadcastOverride === 'true' ||
        params.broadcastOverride === true;
      window.onbeforeunload = () => {
        this.chrome.windowCallback({
          error: ERRORS.CANCELLED,
          return: requestTarget.Send,
          ID: this.messageID,
        });
      };
      this.toAddress = params.toAddress || '';
      this.assetId = params.asset || '';
      this.amount = params.amount || 0;
      this.symbol = params.symbol || '';
      if (
        this.txHashAttributes === null &&
        this.dataJson.txHashAttributes !== undefined
      ) {
        this.txHashAttributes = this.dataJson.txHashAttributes;
      }
      // this.fee = params.fee || 0;
      if (params.fee) {
        this.fee = parseFloat(params.fee);
      } else {
        this.asset.getGasFee().subscribe((res: GasFeeSpeed) => {
          this.fee = Number(res.propose_price);
        });
      }
      this.remark = params.remark || '';
      if (this.assetId !== undefined && this.assetId !== '') {
        this.asset
          .getAssetDetail(this.fromAddress, this.assetId)
          .then((res: Asset) => {
            this.init = true;
            this.symbol = res.symbol;
            this.balance = res;
            this.submit();
            this.getAssetRate();
          });
      } else {
        this.getAssetDetail();
      }
    });
  }

  async getAssetDetail() {
    const symbols = await this.neoAssetInfoState.getAssetSymbols(
      [this.assetId],
      this.chainType
    );
    this.symbol = symbols[0];
    const balance = await this.asset.getAddressAssetBalance(
      this.fromAddress,
      this.assetId,
      this.chainType
    );
    if (new BigNumber(balance).comparedTo(0) > 0) {
      const decimals = await this.neoAssetInfoState.getAssetDecimals(
        [this.assetId],
        this.chainType
      );
      this.balance = {
        asset_id: this.assetId,
        balance: new BigNumber(balance).shiftedBy(-decimals[0]).toFixed(),
        symbol: symbols[0],
        decimals: decimals[0],
      };
      this.init = true;
      this.submit();
      this.getAssetRate();
    } else {
      this.global.snackBarTip('balanceLack');
    }
  }

  public submit() {
    this.loading = true;
    this.loadingMsg = 'Loading';
    if (
      this.balance.balance === undefined ||
      bignumber(this.balance.balance).comparedTo(0) < 1
    ) {
      this.global.snackBarTip('balanceLack');
      return;
    }
    if (
      bignumber(this.balance.balance.toString()).comparedTo(
        bignumber(this.amount.toString())
      ) === -1 ||
      this.amount === '0'
    ) {
      this.global.snackBarTip('balanceLack');
      return;
    }
    this.creating = true;
    this.asset
      .getAssetDetail(this.fromAddress, this.assetId)
      .then((res: Asset) => {
        this.loading = false;
        this.loadingMsg = '';
        this.balance = res;
        this.transfer
          .create(
            this.fromAddress,
            this.toAddress,
            this.assetId,
            this.amount,
            this.fee,
            res.decimals,
            this.broadcastOverride
          )
          .subscribe(
            (tx: Transaction) => {
              if (this.remark !== '') {
                tx.addAttribute(
                  tx2.TxAttrUsage.Remark2,
                  u.str2hexstring(this.remark)
                );
              }
              if (this.txHashAttributes !== null) {
                this.txHashAttributes.forEach((item, index) => {
                  const info = parseNeo2TxHashAttr(
                    this.txHashAttributes[index],
                    true
                  );
                  if (tx2.TxAttrUsage[info.txAttrUsage]) {
                    tx.addAttribute(
                      tx2.TxAttrUsage[info.txAttrUsage],
                      info.value
                    );
                  }
                });
              }
              this.resolveSign(tx);
            },
            () => {
              this.creating = false;
              this.global.snackBarTip('wentWrong');
            }
          );
      });
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTarget.Send,
        ID: this.messageID,
      },
      true
    );
  }

  private resolveSign(transaction: Transaction) {
    this.creating = false;
    this.tx = transaction;
    this.txSerialize = this.tx.serialize(false);
  }

  private resolveSend(tx: Transaction) {
    if (this.broadcastOverride) {
      this.loading = false;
      this.loadingMsg = '';
      this.chrome.windowCallback(
        {
          data: {
            txid: this.tx.hash,
            signedTx: this.tx.serialize(true),
          },
          return: requestTarget.Send,
          ID: this.messageID,
        },
        true
      );
      return;
    }
    this.loadingMsg = 'Wait';
    this.loading = true;
    return this.txState
      .rpcSendRawTransaction(tx.serialize(true))
      .then(async (res) => {
        if (!res) {
          throw {
            msg: 'Transaction rejected by RPC node.',
          };
        }
        this.loading = false;
        this.loadingMsg = '';
        this.creating = false;
        if (this.fromAddress !== this.toAddress) {
          const txTarget = {
            txid: '0x' + tx.hash,
            value: -this.amount,
            block_time: Math.floor(new Date().getTime() / 1000),
          };
          this.pushTransaction(txTarget);
        }
        this.chrome.windowCallback({
          data: {
            txid: tx.hash,
            nodeUrl: `${this.n2Network.rpcUrl}`,
          },
          return: requestTarget.Send,
          ID: this.messageID,
        });
        const setData = {};
        setData[`TxArr_${this.chainType}-${this.n2Network.id}`] =
          (await this.chrome.getLocalStorage(
            `TxArr_${this.chainType}-${this.n2Network.id}`
          )) || [];
        setData[`TxArr_${this.chainType}-${this.n2Network.id}`].push(
          '0x' + tx.hash
        );
        this.chrome.setLocalStorage(setData);
        this.dialog.open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        });
      })
      .catch((err) => {
        this.loading = false;
        this.loadingMsg = '';
        this.creating = false;
        this.chrome.windowCallback({
          error: { ...ERRORS.RPC_ERROR, description: err },
          return: requestTarget.Send,
          ID: this.messageID,
        });
        this.neo3Service.handleRpcError(err, 'Neo2');
      });
  }

  public pushTransaction(transaction: object) {
    const networkName = `${this.chainType}-${this.n2Network.id}`;
    const address = this.fromAddress;
    const assetId = this.assetId;
    this.chrome.getStorage(STORAGE_NAME.transaction).subscribe((res) => {
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
    });
  }

  public async getAssetRate() {
    if (Number(this.fee) > 0) {
      this.feeMoney = await this.asset.getAssetAmountRate({
        chainType: 'Neo2',
        assetId: GAS,
        amount: this.fee,
      });
    }
    this.money = await this.asset.getAssetAmountRate({
      chainType: 'Neo2',
      assetId: this.assetId,
      amount: this.amount,
    });
    if (this.feeMoney && this.money) {
      this.totalMoney = this.global
        .mathAdd(Number(this.feeMoney), Number(this.money))
        .toString();
    }
  }

  public exit() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTarget.Send,
        ID: this.messageID,
      },
      true
    );
  }

  public confirm() {
    if (this.creating) {
      return;
    }
    this.getSignTx(this.tx);
  }
  public editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          fee: this.fee,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res !== false) {
          this.fee = res;
          if (res === 0 || res === '0') {
            this.feeMoney = '0';
          } else {
            this.asset
              .getAssetAmountRate({
                chainType: 'Neo2',
                assetId: GAS,
                amount: this.fee,
              })
              .then((res) => {
                this.feeMoney = res;
                if (this.feeMoney && this.money) {
                  this.totalMoney = this.global
                    .mathAdd(Number(this.feeMoney), Number(this.money))
                    .toString();
                }
              });
          }
          this.submit();
        }
      });
  }

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.tx = tx;
      this.resolveSend(tx);
    }
  }

  private getSignTx(tx: Transaction) {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.unsignedTx = tx;
      this.showHardwareSign = true;
      return;
    }
    this.global
      .getWIF(this.neo2WIFArr, this.neo2WalletArr, this.currentWallet)
      .then((wif) => {
        tx.sign(wif);
        this.tx = tx;
        this.resolveSend(tx);
      });
  }
}
