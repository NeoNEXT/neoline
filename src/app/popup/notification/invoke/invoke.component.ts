import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GlobalService,
  NeonService,
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
import { wallet, tx, sc, u } from '@cityofzion/neon-core';
import Neon from '@cityofzion/neon-js';
import { MatDialog } from '@angular/material/dialog';
import { NEO, UTXO, GAS } from '@/models/models';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { ERRORS, requestTarget, TxHashAttribute } from '@/models/dapi';
import {
  PopupEditFeeDialogComponent,
  PopupTransferSuccessDialogComponent,
} from '../../_dialogs';
import { GasFeeSpeed, RpcNetwork } from '../../_lib/type';
import { bignumber } from 'mathjs';
import BigNumber from 'bignumber.js';
import { LedgerStatuses, ChainType } from '../../_lib';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';

type TabType = 'details' | 'data';

@Component({
  templateUrl: 'invoke.component.html',
  styleUrls: ['invoke.component.scss'],
})
export class PopupNoticeInvokeComponent implements OnInit, OnDestroy {
  tabType: TabType = 'details';
  public dataJson: any = {};
  public feeMoney = '0';
  public rateCurrency = '';
  public txSerialize = '';
  public showFeeEdit: boolean = true;

  private pramsData: any;
  public scriptHash = '';
  public operation = '';
  public args = null;
  public tx: Transaction;
  public triggerContractVerification: boolean = false;
  public attachedAssets = null;
  public fee = null;
  public minFee = 0;
  public broadcastOverride = null;
  public assetIntentOverrides = null;
  public loading = false;
  public loadingMsg: string;
  private messageID = 0;
  private txHashAttributes: TxHashAttribute[] = null;
  private utxos: UTXO[] = [];

  private extraWitness: [] = [];

  getStatusInterval;

  private accountSub: Unsubscribable;
  public signAddress: string;
  public n2Network: RpcNetwork;
  private currentWallet: Wallet2;
  private chainType: ChainType;
  private neo2WIFArr: string[];
  private neo2WalletArr: Array<Wallet2>;
  constructor(
    private aRoute: ActivatedRoute,
    private router: Router,
    private global: GlobalService,
    private neon: NeonService,
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
      this.currentWallet = state.currentWallet as Wallet2;
      this.signAddress = state.currentWallet?.accounts[0]?.address;
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
      this.pramsData = JSON.parse(JSON.stringify(params));
      this.messageID = params.messageID;
      for (const key in this.pramsData) {
        if (Object.prototype.hasOwnProperty.call(this.pramsData, key)) {
          let tempObject: any;
          try {
            tempObject = this.pramsData[key]
              .replace(/([a-zA-Z0-9]+?):/g, '"$1":')
              .replace(/'/g, '"');
            tempObject = JSON.parse(tempObject);
          } catch (error) {
            tempObject = this.pramsData[key];
          }
          this.pramsData[key] = tempObject;
        }
      }
      if (Number(this.pramsData.fee) > 0) {
        this.assetState.getAssetRate('GAS', GAS).then((rate) => {
          this.feeMoney = new BigNumber(this.pramsData.fee)
            .times(rate || 0)
            .toFixed();
        });
      }
      this.dataJson = this.pramsData;
      this.dataJson.messageID = undefined;
      this.triggerContractVerification =
        params.triggerContractVerification !== undefined
          ? params.triggerContractVerification.toString() === 'true'
          : false;
      if (
        params.scriptHash !== undefined &&
        params.operation !== undefined &&
        params.args !== undefined
      ) {
        this.scriptHash = params.scriptHash;
        this.operation = params.operation;
        this.args = this.pramsData.args;
        if (
          this.scriptHash === 'f46719e2d16bf50cddcef9d4bbfece901f73cbb6' &&
          this.operation === 'refund'
        ) {
          this.showFeeEdit = false;
        }
        if (this.pramsData.hostname.indexOf('switcheo') >= 0) {
          this.showFeeEdit = false;
        }
        this.args.forEach((item, index) => {
          if (item.type === 'Address') {
            const param2 = u.reverseHex(
              wallet.getScriptHashFromAddress(item.value)
            );
            this.args[index] = param2;
          } else if (item.type === 'Boolean') {
            if (typeof item.value === 'string') {
              if ((item.value && item.value.toLowerCase()) === 'true') {
                this.args[index] = true;
              } else if (item.value && item.value.toLowerCase() === 'false') {
                this.args[index] = false;
              } else {
                this.chrome.windowCallback(
                  {
                    error: ERRORS.MALFORMED_INPUT,
                    return: requestTarget.Invoke,
                    ID: this.messageID,
                  },
                  true
                );
              }
            }
          } else if (item.type === 'Integer') {
            this.args[index] = Neon.create.contractParam(
              'Integer',
              item.value.toString()
            );
          }
        });
        // this.fee = parseFloat(params.fee) || 0;
        if (params.minReqFee) {
          this.minFee = Number(params.minReqFee);
        }
        if (params.fee) {
          this.fee = Number(params.fee);
        } else {
          this.fee = 0;
          if (this.showFeeEdit) {
            this.assetState.getGasFee().subscribe((res: GasFeeSpeed) => {
              this.fee = bignumber(this.minFee)
                .add(bignumber(res.propose_price))
                .toNumber();
              this.signTx();
            });
          }
        }
        this.attachedAssets = this.pramsData.attachedAssets;

        if (
          this.assetIntentOverrides == null &&
          this.pramsData.assetIntentOverrides !== undefined
        ) {
          this.assetIntentOverrides = this.pramsData.assetIntentOverrides;
          if (!this.showFeeEdit) {
            this.fee = 0;
            this.feeMoney = '0';
          }
          this.attachedAssets = null;
        }
        if (
          this.txHashAttributes === null &&
          this.pramsData.txHashAttributes !== undefined
        ) {
          this.txHashAttributes = this.pramsData.txHashAttributes;
        }
        this.broadcastOverride =
          this.pramsData.broadcastOverride === true || false;
        if (params.extra_witness !== undefined) {
          this.extraWitness = this.pramsData.extra_witness;
        }
        this.signTx();
      } else {
        return;
      }
    });
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        error: ERRORS.CANCELLED,
        return: requestTarget.Invoke,
        ID: this.messageID,
      });
    };
  }

  private async resolveSign(transaction: Transaction) {
    this.loading = true;
    this.loadingMsg = 'Wait';
    if (this.triggerContractVerification) {
      transaction.scripts = [
        await this.neon.getNeo2VerificationSignatureForSmartContract(
          this.scriptHash
        ),
        ...transaction.scripts,
      ];
    }
    if (this.extraWitness.length > 0) {
      this.extraWitness.forEach((item: any) => {
        if (
          item.invocationScript !== undefined ||
          item.verificationScript !== undefined
        ) {
          const tempWitness = new tx.Witness({
            invocationScript: item.invocationScript || '',
            verificationScript: item.verificationScript || '',
          });
          tempWitness.scriptHash = item.scriptHash;
          transaction.scripts.push(tempWitness);
        }
      });
    }
    if (transaction === null) {
      return;
    }
    this.loading = false;
    this.tx = transaction;
    this.txSerialize = this.tx.serialize(false);
  }

  private async resolveSend(transaction: Transaction) {
    this.loading = true;
    this.loadingMsg = 'Wait';
    let serialize = '';
    try {
      serialize = transaction.serialize(true);
    } catch (error) {
      this.loading = false;
      this.loadingMsg = '';
      this.chrome.windowCallback({
        error: { ...ERRORS.RPC_ERROR, description: error?.message || error },
        return: requestTarget.Invoke,
        ID: this.messageID,
      });
      this.global.snackBarTip('transferFailed', error.msg || error);
      return;
    }
    return this.txState
      .rpcSendRawTransaction(serialize)
      .then(async (res) => {
        if (!res) {
          throw {
            msg: 'Transaction rejected by RPC node.',
          };
        }
        this.loading = false;
        this.loadingMsg = '';
        if (res.error !== undefined) {
          this.global.handlePrcError(res.error, 'Neo2');
          this.chrome.windowCallback(
            {
              error: { ...ERRORS.RPC_ERROR, description: res?.error },
              return: requestTarget.Invoke,
              ID: this.messageID,
            },
            true
          );
        } else {
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
          this.chrome.windowCallback(
            {
              data: {
                txid: transaction.hash,
                nodeUrl: `${this.n2Network.rpcUrl}`,
              },
              return: requestTarget.Invoke,
              ID: this.messageID,
            },
            true
          );
        }
      })
      .catch((err) => {
        console.log(err);
        this.loading = false;
        this.loadingMsg = '';
        this.chrome.windowCallback({
          error: { ...ERRORS.RPC_ERROR, description: err },
          return: requestTarget.Invoke,
          ID: this.messageID,
        });
        this.global.handlePrcError(err, 'Neo2');
      });
  }

  private createTxForNEP5(): Promise<Transaction> {
    return new Promise(async (resolve, reject) => {
      const fromScript = wallet.getScriptHashFromAddress(this.signAddress);
      const toScript =
        this.scriptHash.startsWith('0x') && this.scriptHash.length === 42
          ? this.scriptHash.substring(2)
          : this.scriptHash;
      let newTx = new tx.InvocationTransaction();
      if (this.scriptHash.length !== 42 && this.scriptHash.length !== 40) {
        this.loading = false;
        this.loadingMsg = '';
        this.chrome.windowCallback(
          {
            error: ERRORS.MALFORMED_INPUT,
            return: requestTarget.Invoke,
            ID: this.messageID,
          },
          true
        );
        return null;
      }
      try {
        newTx.script = sc.createScript({
          scriptHash:
            this.scriptHash.startsWith('0x') && this.scriptHash.length === 42
              ? this.scriptHash.substring(2)
              : this.scriptHash,
          operation: this.operation,
          args: this.args,
        });
      } catch (error) {
        reject(error);
      }
      if (this.assetIntentOverrides == null) {
        if (this.attachedAssets !== null && this.attachedAssets !== undefined) {
          if (this.attachedAssets.NEO) {
            try {
              newTx = await this.addAttachedAssets(
                NEO,
                this.attachedAssets.NEO,
                fromScript,
                toScript,
                newTx
              );
            } catch (error) {
              this.chrome.windowCallback(
                {
                  error: { ...ERRORS.INSUFFICIENT_FUNDS, description: error },
                  return: requestTarget.Invoke,
                  ID: this.messageID,
                },
                true
              );
            }
          }
          if (this.attachedAssets.GAS) {
            try {
              newTx = await this.addAttachedAssets(
                GAS,
                this.attachedAssets.GAS,
                fromScript,
                toScript,
                newTx,
                this.fee
              );
            } catch (error) {
              console.log(error);
            }
          } else {
            if (this.fee > 0) {
              try {
                newTx = await this.addFee(this.signAddress, newTx, this.fee);
              } catch (error) {
                console.log(error);
              }
            }
          }
        } else {
          if (this.fee > 0) {
            try {
              newTx = await this.addFee(this.signAddress, newTx, this.fee);
            } catch (error) {
              console.log(error);
            }
          }
        }
      } else {
        if (this.fee > 0 && this.showFeeEdit) {
          try {
            newTx = await this.addFee(this.signAddress, newTx, this.fee);
          } catch (error) {
            console.log(error);
          }
        }
        this.assetIntentOverrides.outputs.forEach((element) => {
          const toScripts = wallet.getScriptHashFromAddress(element.address);
          let assetId = element.asset;
          if (element.asset.toString().toLowerCase() === 'gas') {
            assetId = GAS;
          }
          if (element.asset.toString().toLowerCase() === 'neo') {
            assetId = NEO;
          }
          newTx.addOutput({
            assetId: assetId.startsWith('0x') ? assetId.substring(2) : assetId,
            value: new Fixed8(Number(element.value)),
            scriptHash:
              toScripts.startsWith('0x') && toScripts.length === 42
                ? toScripts.substring(2)
                : toScripts,
          });
        });
        this.assetIntentOverrides.inputs.forEach((element) => {
          newTx.inputs.push(
            new TransactionInput({
              prevIndex: element.index,
              prevHash:
                element.txid.startsWith('0x') && element.txid.length === 66
                  ? element.txid.substring(2)
                  : element.txid,
            })
          );
        });
      }
      newTx = await this.addAttributes(newTx);
      resolve(newTx);
    });
  }

  private async addAttributes(
    transaction: InvocationTransaction
  ): Promise<InvocationTransaction> {
    const fromScript = wallet.getScriptHashFromAddress(this.signAddress);
    if (this.txHashAttributes !== null) {
      this.txHashAttributes.forEach((item, index) => {
        this.txHashAttributes[index] = this.neon.parseNeo2TxHashAttr(
          this.txHashAttributes[index]
        );
        const info = this.txHashAttributes[index];
        if (tx.TxAttrUsage[info.txAttrUsage]) {
          transaction.addAttribute(
            tx.TxAttrUsage[info.txAttrUsage],
            info.value
          );
        }
      });
    }
    if (
      this.assetIntentOverrides &&
      this.assetIntentOverrides.inputs &&
      this.assetIntentOverrides.inputs.length
    ) {
      this.utxos = this.utxos.concat(
        await this.assetState.getNeo2Utxo(this.signAddress, NEO).toPromise()
      );
      this.utxos = this.utxos.concat(
        await this.assetState.getNeo2Utxo(this.signAddress, GAS).toPromise()
      );
    }
    if (this.triggerContractVerification) {
      transaction.addAttribute(
        tx.TxAttrUsage.Script,
        u.reverseHex(this.scriptHash)
      );
    } else if (
      (transaction.inputs.length === 0 &&
        transaction.outputs.length === 0 &&
        !this.assetIntentOverrides) ||
      (this.assetIntentOverrides &&
        this.assetIntentOverrides.inputs &&
        this.assetIntentOverrides.inputs.length &&
        // eslint-disable-next-line max-len
        !this.assetIntentOverrides.inputs.filter(({ index, txid }) =>
          this.utxos.find(
            (utxo) =>
              utxo.n === index &&
              (utxo.txid === txid || utxo.txid.slice(2) === txid)
          )
        ).length)
    ) {
      transaction.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(fromScript));
    }
    const remark = this.broadcastOverride
      ? 'From NeoLine'
      : `From NeoLine at ${new Date().getTime()}`;
    transaction.addAttribute(tx.TxAttrUsage.Remark1, u.str2hexstring(remark));
    return transaction;
  }

  private addAttachedAssets(
    assetid: string,
    amount: number,
    fromScript: string,
    toScript: string,
    newTx: InvocationTransaction,
    fee: number = 0
  ): Promise<InvocationTransaction> {
    return new Promise((resolve, reject) => {
      this.assetState
        .getNeo2Utxo(this.signAddress, assetid)
        .subscribe((balances: any) => {
          if (balances.length === 0) {
            reject('no balance');
          }
          let assetId = balances[0].asset_id;
          if (assetId.startsWith('0x') && assetId.length === 66) {
            assetId = assetId.substring(2);
          }
          newTx.addOutput({
            assetId,
            value: new Fixed8(amount),
            scriptHash: toScript,
          });
          let curr = 0.0;
          for (const item of balances) {
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
            if (curr >= amount + fee) {
              break;
            }
          }
          const payback =
            assetId === GAS || assetId === GAS.substring(2)
              ? this.global.mathSub(this.global.mathSub(curr, amount), fee)
              : this.global.mathSub(curr, amount);
          if (payback < 0) {
            reject('no enough balance to pay');
          }
          if (payback > 0) {
            newTx.addOutput({
              assetId,
              value: new Fixed8(payback),
              scriptHash: fromScript,
            });
          }
          resolve(newTx);
        });
    });
  }

  public addFee(
    from: string,
    newTx: InvocationTransaction,
    fee: number = 0
  ): Promise<InvocationTransaction> {
    return new Promise((resolve) => {
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
          this.fee = curr;
          // reject('no eunough GAS to fee');
          // this.chrome.windowCallback({
          //     error: ERRORS.INSUFFICIENT_FUNDS,
          //     return: requestTarget.Invoke,
          //     ID: this.messageID
          // });
          // this.global.snackBarTip('transferFailed', 'no enough GAS to fee');
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
        return: requestTarget.Invoke,
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
          return: requestTarget.Invoke,
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
          minFee: this.minFee,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res || res === 0) {
          this.fee = res;
          if (res < this.minFee) {
            this.fee = this.minFee;
          }
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
              return: requestTarget.Invoke,
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
    this.util
      .getWIF(this.neo2WIFArr, this.neo2WalletArr, this.currentWallet)
      .then((wif) => {
        tx.sign(wif);
        this.tx = tx;
        this.resolveSend(tx);
      });
  }
}
