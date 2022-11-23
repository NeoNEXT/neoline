import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AssetState,
  NeonService,
  GlobalService,
  ChromeService,
  TransactionState,
  TransferService,
  LedgerService,
  UtilServiceState,
} from '@/app/core';
import { NEO, GAS, Asset } from '@/models/models';
import { tx as tx2, u } from '@cityofzion/neon-js';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { ERRORS, requestTarget, TxHashAttribute } from '@/models/dapi';
import { MatDialog } from '@angular/material/dialog';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { bignumber } from 'mathjs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { STORAGE_NAME, ChainType } from '../../_lib';
import BigNumber from 'bignumber.js';
import { LedgerStatuses } from '../../_lib';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: 'transfer.component.html',
  styleUrls: ['transfer.component.scss'],
})
export class PopupNoticeTransferComponent implements OnInit, AfterViewInit {
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
  private txHashAttributes: TxHashAttribute[] = null;

  public fee: number;
  public init = false;
  private broadcastOverride = false;
  private messageID = 0;
  getStatusInterval;

  private accountSub: Unsubscribable;
  public fromAddress: string;
  public n2Network: RpcNetwork;
  private currentWallet: Wallet2 | Wallet3;
  private chainType: ChainType;
  private neo2WIFArr: string[];
  private neo2WalletArr: Wallet2[];
  constructor(
    private router: Router,
    private aRoute: ActivatedRoute,
    private asset: AssetState,
    private transfer: TransferService,
    private neon: NeonService,
    private global: GlobalService,
    private chrome: ChromeService,
    private txState: TransactionState,
    private dialog: MatDialog,
    private ledger: LedgerService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.fromAddress = state.currentWallet.accounts[0].address;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.neo2WIFArr = state.neo2WIFArr;
      this.neo2WalletArr = state.neo2WalletArr;
    });
  }

  ngOnInit(): void {
    this.rateCurrency = this.asset.rateCurrency;
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
        if (this.asset.gasFeeSpeed) {
          this.fee = Number(this.asset.gasFeeSpeed.propose_price);
        } else {
          this.asset.getGasFee().subscribe((res: GasFeeSpeed) => {
            this.fee = Number(res.propose_price);
          });
        }
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

  ngAfterViewInit(): void {}

  async getAssetDetail() {
    const symbols = await this.util.getAssetSymbols(
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
      const decimals = await this.util.getAssetDecimals(
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
            (tx) => {
              if (this.remark !== '') {
                tx.addAttribute(
                  tx2.TxAttrUsage.Remark2,
                  u.str2hexstring(this.remark)
                );
              }
              if (this.txHashAttributes !== null) {
                this.txHashAttributes.forEach((item, index) => {
                  const info = this.neon.parseTxHashAttr(
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
            block_time: new Date().getTime() / 1000,
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
        setData[`TxArr_${this.n2Network.id}`] =
          (await this.chrome.getLocalStorage(`TxArr_${this.n2Network.id}`)) ||
          [];
        setData[`TxArr_${this.n2Network.id}`].push('0x' + tx.hash);
        this.chrome.setLocalStorage(setData);
        this.router.navigate([
          {
            outlets: {
              transfer: ['transfer', 'result'],
            },
          },
        ]);
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
        this.global.handlePrcError(err, 'Neo2');
      });
  }

  public pushTransaction(transaction: object) {
    const networkId = this.n2Network.id;
    const address = this.fromAddress;
    const assetId = this.assetId;
    this.chrome.getStorage(STORAGE_NAME.transaction).subscribe((res) => {
      if (res === null || res === undefined) {
        res = {};
      }
      if (res[networkId] === undefined) {
        res[networkId] = {};
      }
      if (res[networkId][address] === undefined) {
        res[networkId][address] = {};
      }
      if (res[networkId][address][assetId] === undefined) {
        res[networkId][address][assetId] = [];
      }
      res[networkId][address][assetId].unshift(transaction);
      this.chrome.setStorage(STORAGE_NAME.transaction, res);
    });
  }

  public async getAssetRate() {
    if (Number(this.fee) > 0) {
      const rate = await this.asset.getAssetRate('GAS', GAS);
      this.feeMoney = new BigNumber(this.fee).times(rate || 0).toFixed();
    }
    const assetRate = await this.asset.getAssetRate(this.symbol, this.assetId);
    this.money = new BigNumber(this.amount).times(assetRate || 0).toFixed();
    this.totalMoney = this.global
      .mathAdd(Number(this.feeMoney), Number(this.money))
      .toString();
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
    } else {
      this.getSignTx(this.tx);
    }
  }
  public editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
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
            this.asset.getAssetRate('GAS', GAS).then((rate) => {
              this.feeMoney = new BigNumber(this.fee)
                .times(rate || 0)
                .toFixed();
              this.totalMoney = this.global
                .mathAdd(Number(this.feeMoney), Number(this.money))
                .toString();
            });
          }
          this.submit();
        }
      });
  }

  public getAddressSub(address: string) {
    return `${address.substr(0, 3)}...${address.substr(
      address.length - 4,
      address.length - 1
    )} `;
  }
  private getLedgerStatus(tx) {
    this.ledger.getDeviceStatus(this.chainType).then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';
        this.ledger
          .getLedgerSignedTx(tx, this.currentWallet, this.chainType)
          .then((tx) => {
            this.loading = false;
            this.loadingMsg = '';
            this.tx = tx;
            this.resolveSend(tx);
          })
          .catch((error) => {
            this.loading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }

  private getSignTx(tx: Transaction) {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.loading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus(tx);
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus(tx);
      });
      return;
    }
    const wif =
      this.neo2WIFArr[
        this.neo2WalletArr.findIndex(
          (item) =>
            item.accounts[0].address === this.currentWallet.accounts[0].address
        )
      ];
    tx.sign(wif);
    this.tx = tx;
    this.resolveSend(tx);
  }
}
