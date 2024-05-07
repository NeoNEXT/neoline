import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GlobalService,
  ChromeService,
  AssetState,
  TransactionState,
  LedgerService,
  UtilServiceState,
} from '@/app/core';
import {
  Transaction,
  TransactionInput,
  InvocationTransaction,
} from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, u } from '@cityofzion/neon-core';
import { MatDialog } from '@angular/material/dialog';
import { ERRORS, GAS, requestTarget } from '@/models/dapi';
import { ScriptBuilder } from '@cityofzion/neon-core/lib/sc';
import { NEO } from '@/models/models';
import { str2hexstring, Fixed8 } from '@cityofzion/neon-core/lib/u';
import {
  PopupEditFeeDialogComponent,
  PopupTransferSuccessDialogComponent,
} from '../../_dialogs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { utf8Encode } from '@angular/compiler/src/util';
import BigNumber from 'bignumber.js';
import { LedgerStatuses, ChainType } from '../../_lib';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';

type TabType = 'details' | 'data';

@Component({
  templateUrl: 'deploy.component.html',
  styleUrls: ['deploy.component.scss'],
})
export class PopupNoticeDeployComponent implements OnInit, OnDestroy {
  tabType: TabType = 'details';
  NEO = NEO;
  public dataJson: any = {};
  public feeMoney = '0';
  public rateCurrency = '';
  public txSerialize = '';
  public fee = '';

  public pramsData: any;
  public tx: Transaction;
  public broadcastOverride = null;
  public loading = false;
  public loadingMsg: string;
  private messageID = 0;

  getStatusInterval;
  private accountSub: Unsubscribable;
  public n2Network: RpcNetwork;
  private wallet: Wallet2;
  private chainType: ChainType;
  private neo2WIFArr: string[];
  private neo2WalletArr: Wallet2[];
  constructor(
    private aRoute: ActivatedRoute,
    private router: Router,
    private global: GlobalService,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private assetState: AssetState,
    private txState: TransactionState,
    private ledger: LedgerService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.wallet = state.currentWallet as Wallet2;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.neo2WIFArr = state.neo2WIFArr;
      this.neo2WalletArr = state.neo2WalletArr;
    });
  }
  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  ngOnInit(): void {
    this.aRoute.queryParams.subscribe(async (params: any) => {
      this.pramsData = params;
      this.messageID = params.messageID;
      this.dataJson = this.pramsData;
      this.dataJson.messageID = undefined;
      if (this.pramsData.networkFee) {
        this.fee = this.pramsData.networkFee;
      } else {
        this.assetState.getGasFee().subscribe((res: GasFeeSpeed) => {
          this.fee = res.propose_price;
          this.signTx();
        });
      }
      if (Number(this.pramsData.fee) > 0) {
        this.assetState.getAssetRate('GAS', GAS).then((rate) => {
          this.feeMoney = new BigNumber(this.fee).times(rate || 0).toFixed();
        });
      }
      return;
    });
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        error: ERRORS.CANCELLED,
        return: requestTarget.Deploy,
        ID: this.messageID,
      });
    };
  }

  private resolveSign(transaction: Transaction) {
    if (transaction === null) {
      return;
    }
    this.tx = transaction;
    this.txSerialize = this.tx.serialize(false);
  }

  private resolveSend(transaction: Transaction) {
    return this.txState
      .rpcSendRawTransaction(transaction.serialize(true))
      .then(async (res) => {
        if (!res) {
          throw {
            msg: 'Transaction rejected by RPC node.',
          };
        }
        this.loading = false;
        this.loadingMsg = '';
        if (res.error !== null && res.error !== undefined) {
          this.chrome.windowCallback(
            {
              error: { ...ERRORS.RPC_ERROR, description: res?.error },
              return: requestTarget.Deploy,
              ID: this.messageID,
            },
            true
          );
          this.global.handlePrcError(res.error, 'Neo2');
        } else {
          this.chrome.windowCallback(
            {
              data: {
                txid: transaction.hash,
                nodeUrl: `${this.n2Network.rpcUrl}`,
              },
              return: requestTarget.Deploy,
              ID: this.messageID,
            },
            true
          );
          const setData = {};
          setData[`TxArr_${this.chainType}-${this.n2Network.id}`] =
            (await this.chrome.getLocalStorage(
              `TxArr_${this.chainType}-${this.n2Network.id}`
            )) || [];
          setData[`TxArr_${this.chainType}-${this.n2Network.id}`].push(
            '0x' + transaction.hash
          );
          this.chrome.setLocalStorage(setData);
          this.dialog.open(PopupTransferSuccessDialogComponent, {
            panelClass: 'custom-dialog-panel',
          });
        }
      })
      .catch((err) => {
        this.loading = false;
        this.loadingMsg = '';
        this.chrome.windowCallback({
          error: { ...ERRORS.RPC_ERROR, description: err },
          return: requestTarget.Deploy,
          ID: this.messageID,
        });
        this.global.handlePrcError(err, 'Neo2');
      });
  }

  private createTxForNEP5(): Promise<Transaction> {
    return new Promise(async (resolve, reject) => {
      const amount =
        (this.pramsData.dynamicInvoke === 'true' ? 500 : 0) +
        (this.pramsData.needsStorage === 'true' ? 400 : 0) +
        90;
      const fromAddress = this.wallet.accounts[0].address;
      let newTx = new tx.InvocationTransaction();
      // eslint-disable-next-line no-bitwise
      const num =
        (this.pramsData.needsStorage === 'true' ? 1 : 0) |
        (this.pramsData.dynamicInvoke === 'true' ? 2 : 0) |
        (this.pramsData.isPayable === 'true' ? 4 : 0);
      const sb = new ScriptBuilder();
      sb.emitPush(str2hexstring(this.pramsData.description))
        .emitPush(str2hexstring(this.pramsData.email))
        .emitPush(str2hexstring(this.pramsData.author))
        .emitPush(str2hexstring(this.pramsData.version))
        .emitPush(str2hexstring(this.pramsData.name))
        .emitPush(num)
        .emitPush(this.pramsData.returnType || 'ff00')
        .emitPush(this.pramsData.parameterList)
        .emitPush(this.pramsData.code)
        .emitSysCall('Neo.Contract.Create');
      try {
        newTx.script = sb.str;
      } catch (error) {
        reject(error);
      }
      try {
        newTx = await this.addFee(
          fromAddress,
          newTx,
          amount + parseFloat(this.fee)
        );
      } catch (error) {
        this.chrome.windowCallback(
          {
            error: ERRORS.INSUFFICIENT_FUNDS,
            return: requestTarget.Deploy,
            ID: this.messageID,
          },
          true
        );
      }
      const remark = this.broadcastOverride
        ? 'From NeoLine'
        : `From NeoLine at ${new Date().getTime()}`;
      newTx.addAttribute(tx.TxAttrUsage.Remark1, u.str2hexstring(remark));
      newTx.gas = new Fixed8(amount);
      resolve(newTx);
    });
  }

  public addFee(
    from: string,
    newTx: InvocationTransaction,
    fee: number = 0
  ): Promise<InvocationTransaction> {
    return new Promise((resolve, reject) => {
      this.assetState.getNeo2Utxo(from, GAS).subscribe((res) => {
        let curr = 0.0;
        for (const item of res) {
          curr = this.global.mathAdd(curr, parseFloat(item.value) || 0);
          newTx.inputs.push(
            new TransactionInput({
              prevIndex: item.n,
              prevHash:
                item.txid.startsWith('0x') && item.txid.length === 66
                  ? item.txid.substring(2)
                  : item.txid,
            })
          );
          if (curr >= fee) {
            break;
          }
        }
        const payback = this.global.mathSub(curr, fee);
        if (payback < 0) {
          reject('no enough GAS to fee');
          return;
        }
        if (payback > 0) {
          const fromScript = wallet.getScriptHashFromAddress(from);
          let gasAssetId = res[0].asset_id;
          if (gasAssetId.startsWith('0x') && gasAssetId.length === 66) {
            gasAssetId = gasAssetId.substring(2);
          }
          newTx.addOutput({
            assetId: gasAssetId,
            value: this.global.mathSub(curr, fee),
            scriptHash: fromScript,
          });
        }
        resolve(newTx);
      });
    });
  }
  public exit() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTarget.Deploy,
        ID: this.messageID,
      },
      true
    );
  }

  public confirm() {
    if (this.broadcastOverride === true) {
      this.loading = false;
      this.loadingMsg = '';
      this.chrome.windowCallback(
        {
          data: {
            txid: this.tx.hash,
            signedTx: this.tx.serialize(true),
          },
          return: requestTarget.Deploy,
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
          this.fee = res.toString();
          if (res === 0 || res === '0') {
            this.feeMoney = '0';
          } else {
            this.assetState.getAssetRate('GAS', GAS).then((rate) => {
              this.feeMoney = new BigNumber(this.fee)
                .times(rate || 0)
                .toFixed();
            });
          }
          this.signTx();
        }
      });
  }
  private signTx() {
    setTimeout(() => {
      this.loading = true;
      this.createTxForNEP5()
        .then((result) => {
          this.resolveSign(result);
        })
        .catch((err) => {
          if (err === 'no enough GAS to fee') {
            return;
          }
          this.chrome.windowCallback(
            {
              error: {
                ...ERRORS.MALFORMED_INPUT,
                description: err?.message || err,
              },
              return: requestTarget.Deploy,
              ID: this.messageID,
            },
            true
          );
        });
    }, 0);
  }
  private getLedgerStatus(tx) {
    this.ledger.getDeviceStatus(this.chainType).then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';
        this.ledger
          .getLedgerSignedTx(tx, this.wallet, this.chainType)
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
    if (this.wallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.loading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus(tx);
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus(tx);
      });
      return;
    }
    this.util
      .getWIF(this.neo2WIFArr, this.neo2WalletArr, this.wallet)
      .then((wif) => {
        tx.sign(wif);
        this.tx = tx;
        this.resolveSend(tx);
      });
  }
}
