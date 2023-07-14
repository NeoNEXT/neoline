import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AssetState,
  GlobalService,
  ChromeService,
  LedgerService,
  UtilServiceState,
} from '@/app/core';
import { NEO } from '@/models/models';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { TransferService } from '@/app/popup/transfer/transfer.service';
import { ERRORS } from '@/models/dapi';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { rpc } from '@cityofzion/neon-core-neo3/lib';
import { MatDialog } from '@angular/material/dialog';
import {
  PopupEditFeeDialogComponent,
  PopupTransferSuccessDialogComponent,
} from '../../_dialogs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { STORAGE_NAME, GAS3_CONTRACT, ChainType } from '../../_lib';
import { Neo3TransferService } from '../../transfer/neo3-transfer.service';
import BigNumber from 'bignumber.js';
import { LedgerStatuses } from '../../_lib';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

type TabType = 'details' | 'data';

@Component({
  templateUrl: 'neo3-transfer.component.html',
  styleUrls: ['neo3-transfer.component.scss'],
})
export class PopupNoticeNeo3TransferComponent implements OnInit, OnDestroy {
  tabType: TabType = 'details';
  NEO = NEO;
  public rpcClient;
  public dataJson: any = {};
  public rateCurrency = '';
  public txSerialize = '';
  public tx: Transaction3;
  public money = '';
  public feeMoney = '0';
  public totalMoney = '';

  public balance: any;
  public creating = false;
  public toAddress: string = '';
  public assetId: string = '';
  public symbol: string = '';
  public amount: string = '0';
  public remark: string = '';
  public loading = false;
  public loadingMsg: string;

  public fee: string;
  public init = false;
  private broadcastOverride = false;
  private messageID = 0;
  public systemFee;
  public networkFee;
  public systemFeeMoney;
  public networkFeeMoney;

  public canSend = false;
  getStatusInterval;

  private accountSub: Unsubscribable;
  public fromAddress: string;
  public n3Network: RpcNetwork;
  private currentWallet: Wallet2 | Wallet3;
  private chainType: ChainType;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private router: Router,
    private aRoute: ActivatedRoute,
    private asset: AssetState,
    private transfer: TransferService,
    private global: GlobalService,
    private chrome: ChromeService,
    private dialog: MatDialog,
    private neo3Transfer: Neo3TransferService,
    private ledger: LedgerService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.fromAddress = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.rpcClient = new rpc.RPCClient(this.n3Network.rpcUrl);
    });
  }
  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  ngOnInit(): void {
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
    this.aRoute.queryParams.subscribe(async (params: any) => {
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
          return: requestTargetN3.Send,
          ID: this.messageID,
        });
      };
      this.toAddress = params.toAddress || '';
      this.assetId = params.asset || '';
      this.amount = params.amount || 0;
      this.symbol = params.symbol || '';
      this.fee = params.fee || 0;
      if (params.fee) {
        this.fee = params.fee;
      } else {
        if (this.asset.gasFeeSpeed) {
          this.fee = this.asset.gasFeeSpeed.propose_price;
        } else {
          this.asset.fetchNeo3GasFee().subscribe((res: GasFeeSpeed) => {
            this.fee = res.propose_price;
          });
        }
      }
      this.remark = params.remark || '';
      this.getAssetDetail();
    });
  }

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
    } else {
      this.global.snackBarTip('balanceLack');
    }
  }

  public submit() {
    this.loading = true;
    this.loadingMsg = 'Loading';
    this.creating = true;
    this.loading = false;
    this.loadingMsg = '';
    this.transfer
      .create(
        this.fromAddress,
        this.toAddress,
        this.assetId,
        this.amount,
        this.fee,
        this.balance.decimals,
        this.broadcastOverride
      )
      .subscribe(
        (tx: any) => {
          this.systemFee = tx.systemFee.toFixed();
          this.networkFee = tx.networkFee.toFixed();
          this.getAssetRate();
          this.canSend = true;
          this.resolveSign(tx);
        },
        (err) => {
          this.creating = false;
          this.canSend = false;
          this.global.snackBarTip(err);
        }
      );
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetN3.Send,
        ID: this.messageID,
      },
      true
    );
  }

  private resolveSign(transaction) {
    this.creating = false;
    this.tx = transaction;
    this.txSerialize = this.tx.serialize(false);
  }

  private resolveSend(tx: Transaction3) {
    this.loadingMsg = 'Wait';
    this.loading = true;
    return this.rpcClient
      .sendRawTransaction(this.neo3Transfer.hexToBase64(tx.serialize(true)))
      .then(async (TxHash) => {
        if (!TxHash) {
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
            txid: TxHash,
            nodeUrl: `${this.n3Network.rpcUrl}`,
          },
          return: requestTargetN3.Send,
          ID: this.messageID,
        });
        const setData = {};
        setData[`TxArr_${this.n3Network.id}`] =
          (await this.chrome.getLocalStorage(`TxArr_${this.n3Network.id}`)) ||
          [];
        setData[`TxArr_${this.n3Network.id}`].push(TxHash);
        this.chrome.setLocalStorage(setData);
        this.dialog.open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
        });
      })
      .catch((err) => {
        console.log(err);
        this.loading = false;
        this.loadingMsg = '';
        this.creating = false;
        this.chrome.windowCallback({
          error: { ...ERRORS.RPC_ERROR, description: err?.error },
          return: requestTargetN3.Send,
          ID: this.messageID,
        });
        this.global.snackBarTip('transferFailed', err.msg || err);
      });
  }

  public pushTransaction(transaction: object) {
    const networkId = this.n3Network.id;
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
    this.asset.getAssetRate('gas', GAS3_CONTRACT).then((rate) => {
      const gasPrice = rate || 0;
      this.feeMoney = new BigNumber(this.fee).times(gasPrice).toFixed();
      this.systemFeeMoney = new BigNumber(this.systemFee)
        .times(gasPrice)
        .toFixed();
      this.networkFeeMoney = new BigNumber(this.networkFee)
        .times(gasPrice)
        .toFixed();
      if (this.symbol === 'GAS') {
        this.money = new BigNumber(this.amount).times(gasPrice).toFixed();
      }
    });
    if (this.symbol !== 'GAS') {
      this.asset.getAssetRate(this.symbol, this.assetId).then((rate) => {
        const price = rate || 0;
        this.money = new BigNumber(this.amount).times(price).toFixed();
      });
    }
  }

  public exit() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetN3.Send,
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
          return: requestTargetN3.Send,
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
        if (res || res === 0) {
          this.fee = res;
          if (res === 0 || res === '0') {
            this.feeMoney = '0';
          } else {
            this.asset.getAssetRate('gas', GAS3_CONTRACT).then((rate) => {
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
      this.loadingMsg = LedgerStatuses[res].msgNeo3 || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';
        this.ledger
          .getLedgerSignedTx(
            tx,
            this.currentWallet,
            this.chainType,
            this.n3Network.magicNumber
          )
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

  private getSignTx(tx: Transaction3) {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.loading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus(tx);
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus(tx);
      });
      return;
    }
    this.util
      .getWIF(this.neo3WIFArr, this.neo3WalletArr, this.currentWallet)
      .then((wif) => {
        tx.sign(wif, this.n3Network.magicNumber);
        this.tx = tx;
        this.resolveSend(tx);
      });
  }
}
