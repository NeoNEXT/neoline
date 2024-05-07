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

import { MatDialog } from '@angular/material/dialog';
import { NEO, UTXO, GAS } from '@/models/models';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { ERRORS, requestTarget, Invoke, TxHashAttribute } from '@/models/dapi';
import {
  PopupEditFeeDialogComponent,
  PopupTransferSuccessDialogComponent,
} from '../../_dialogs';
import Neon from '@cityofzion/neon-js';
import { RpcNetwork } from '../../_lib/type';
import { bignumber } from 'mathjs';
import { ChainType } from '../../_lib';
import { BigNumber } from 'bignumber.js';
import { LedgerStatuses } from '../../_lib';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';

type TabType = 'details' | 'data';

@Component({
  templateUrl: 'invoke-multi.component.html',
  styleUrls: ['invoke-multi.component.scss'],
})
export class PopupNoticeInvokeMultiComponent implements OnInit, OnDestroy {
  tabType: TabType = 'details';
  public dataJson: any = {};
  public feeMoney = '0';
  public rateCurrency = '';
  public txSerialize = '';
  public showFeeEdit: boolean = true;

  private pramsData: any;
  public tx: Transaction;
  public invokeArgs: Invoke[] = [];
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
      this.pramsData.invokeArgs.forEach((item, index) => {
        item.args.forEach((arg, argIndex) => {
          if (arg.type === 'Address') {
            const param2 = u.reverseHex(
              wallet.getScriptHashFromAddress(arg.value)
            );
            this.pramsData.invokeArgs[index].args[argIndex] = param2;
          } else if (arg.type === 'Boolean') {
            if (typeof arg.value === 'string') {
              if ((arg.value && arg.value.toLowerCase()) === 'true') {
                this.pramsData.invokeArgs[index].args[argIndex] = true;
              } else if (arg.value && arg.value.toLowerCase() === 'false') {
                this.pramsData.invokeArgs[index].args[argIndex] = false;
              } else {
                this.chrome.windowCallback(
                  {
                    error: ERRORS.MALFORMED_INPUT,
                    return: requestTarget.InvokeMulti,
                    ID: this.messageID,
                  },
                  true
                );
              }
            }
          } else if (item.type === 'Integer') {
            this.pramsData.invokeArgs[index].args[argIndex] =
              Neon.create.contractParam('Integer', item.value.toString());
          }
        });
        this.invokeArgs.push({
          scriptHash: item.scriptHash,
          operation: item.operation,
          args: this.pramsData.invokeArgs[index].args,
          triggerContractVerification:
            item.triggerContractVerification !== undefined
              ? item.triggerContractVerification.toString() === 'true'
              : false,
          attachedAssets: item.attachedAssets,
        });
        if (
          item.scriptHash === 'f46719e2d16bf50cddcef9d4bbfece901f73cbb6' &&
          item.operation === 'refund' &&
          this.pramsData.hostname.indexOf('flamingo') >= 0
        ) {
          this.showFeeEdit = false;
        }
      });
      if (this.pramsData.hostname.indexOf('switcheo') >= 0) {
        this.showFeeEdit = false;
      }
      if (params.minReqFee) {
        this.minFee = Number(params.minReqFee);
      }
      if (params.fee) {
        this.fee = Number(params.fee) || 0;
      } else {
        this.fee = 0;
        if (this.showFeeEdit) {
          const tempGasFeeSpeed = await this.assetState.getGasFee().toPromise();
          this.fee = bignumber(this.minFee)
            .add(bignumber(tempGasFeeSpeed.propose_price))
            .toNumber();
        }
      }
      if (
        this.assetIntentOverrides === null &&
        this.pramsData.assetIntentOverrides !== undefined
      ) {
        this.assetIntentOverrides = this.pramsData.assetIntentOverrides;
        if (!this.showFeeEdit) {
          this.fee = 0;
          this.feeMoney = '0';
        }
        this.invokeArgs.forEach((item) => {
          item.attachedAssets = null;
        });
      }
      if (
        this.txHashAttributes === null &&
        this.pramsData.txHashAttributes !== undefined
      ) {
        this.txHashAttributes = this.pramsData.txHashAttributes;
      }
      if (params.extra_witness !== undefined) {
        this.extraWitness = this.pramsData.extra_witness;
      }
      this.broadcastOverride =
        this.pramsData.broadcastOverride === true || false;
      this.signTx();
    });
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        error: ERRORS.CANCELLED,
        return: requestTarget.InvokeMulti,
        ID: this.messageID,
      });
    };
  }

  private resolveSign(transaction: Transaction) {
    this.loading = true;
    this.loadingMsg = 'Wait';
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
    new Promise((myResolve) => {
      myResolve(true);
    })
      .then(() => {
        const triggerContracts = Object.keys(
          this.invokeArgs.reduce(
            (accum, { scriptHash, triggerContractVerification }) => {
              if (triggerContractVerification) {
                accum[scriptHash] = true;
              }
              return accum;
            },
            {}
          )
        );
        return Promise.all(
          triggerContracts.map((scriptHash) =>
            this.neon.getNeo2VerificationSignatureForSmartContract(scriptHash)
          )
        );
      })
      .then((scripts) => {
        transaction.scripts = [...scripts, ...transaction.scripts];
        let serialize = '';
        try {
          serialize = transaction.serialize(true);
        } catch (error) {
          this.loading = false;
          this.loadingMsg = '';
          this.chrome.windowCallback({
            error: { ...ERRORS.RPC_ERROR, description: error },
            return: requestTarget.InvokeMulti,
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
                  return: requestTarget.InvokeMulti,
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
                  return: requestTarget.InvokeMulti,
                  ID: this.messageID,
                },
                true
              );
            }
          })
          .catch((err) => {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
              error: { ...ERRORS.RPC_ERROR, description: err },
              return: requestTarget.InvokeMulti,
              ID: this.messageID,
            });
            this.global.handlePrcError(err, 'Neo2');
          });
      });
  }

  private createTxForNEP5(): Promise<Transaction> {
    return new Promise(async (mResolve, reject) => {
      const fromScript = wallet.getScriptHashFromAddress(this.signAddress);
      let newTx = new tx.InvocationTransaction();
      let script = '';
      let NEOAmount = 0;
      let GASAmount = 0;
      this.invokeArgs.forEach((item) => {
        if (this.assetIntentOverrides == null) {
          if (
            item.attachedAssets !== null &&
            item.attachedAssets !== undefined
          ) {
            NEOAmount += Number(item.attachedAssets.NEO || '0');
            GASAmount += Number(item.attachedAssets.GAS || '0');
          }
        }
        if (item.scriptHash.length !== 42 && item.scriptHash.length !== 40) {
          this.loading = false;
          this.loadingMsg = '';
          this.chrome.windowCallback(
            {
              error: ERRORS.MALFORMED_INPUT,
              return: requestTarget.InvokeMulti,
              ID: this.messageID,
            },
            true
          );
          return null;
        }
        try {
          script += sc.createScript({
            scriptHash:
              item.scriptHash.startsWith('0x') && item.scriptHash.length === 42
                ? item.scriptHash.substring(2)
                : item.scriptHash,
            operation: item.operation,
            args: item.args,
          });
        } catch (error) {
          console.log(error);
          reject(error);
        }
      });
      newTx.script = script;
      if (this.assetIntentOverrides == null) {
        this.invokeArgs.forEach((item) => {
          const toScript =
            item.scriptHash.startsWith('0x') && item.scriptHash.length === 42
              ? item.scriptHash.substring(2)
              : item.scriptHash;
          if (
            item.attachedAssets !== null &&
            item.attachedAssets !== undefined
          ) {
            if (item.attachedAssets.NEO) {
              try {
                newTx.addOutput({
                  assetId: NEO.substring(2),
                  value: new Fixed8(Number(item.attachedAssets.NEO)),
                  scriptHash: toScript,
                });
              } catch (error) {
                this.chrome.windowCallback(
                  {
                    error: {
                      ...ERRORS.MALFORMED_INPUT,
                      description: error?.message || error,
                    },
                    return: requestTarget.InvokeMulti,
                    ID: this.messageID,
                  },
                  true
                );
              }
            }
            if (item.attachedAssets.GAS) {
              try {
                newTx.addOutput({
                  assetId: GAS.substring(2),
                  value: new Fixed8(Number(item.attachedAssets.GAS)),
                  scriptHash: toScript,
                });
              } catch (error) {
                console.log(error);
                this.chrome.windowCallback(
                  {
                    error: {
                      ...ERRORS.MALFORMED_INPUT,
                      description: error?.message || error,
                    },
                    return: requestTarget.InvokeMulti,
                    ID: this.messageID,
                  },
                  true
                );
              }
            }
          }
        });
        if (NEOAmount > 0) {
          try {
            newTx = await this.addInputs(NEO, NEOAmount, fromScript, newTx);
          } catch (error) {
            this.chrome.windowCallback(
              {
                error: ERRORS.INSUFFICIENT_FUNDS,
                return: requestTarget.InvokeMulti,
                ID: this.messageID,
              },
              true
            );
          }
        }
        if (GASAmount > 0) {
          try {
            newTx = await this.addInputs(
              GAS,
              GASAmount,
              fromScript,
              newTx,
              this.fee
            );
          } catch (error) {
            this.chrome.windowCallback(
              {
                error: ERRORS.INSUFFICIENT_FUNDS,
                return: requestTarget.InvokeMulti,
                ID: this.messageID,
              },
              true
            );
          }
        }
        if (this.fee > 0 && GASAmount === 0) {
          try {
            newTx = await this.addFee(this.signAddress, newTx, this.fee);
          } catch (error) {}
        }
      } else {
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
        if (this.fee > 0 && this.showFeeEdit) {
          try {
            newTx = await this.addFee(this.signAddress, newTx, this.fee);
          } catch (error) {
            console.log(error);
          }
        }
      }
      mResolve(await this.addAttributes(newTx));
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
    let addScriptHash = '';
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.invokeArgs.length; i++) {
      if (this.invokeArgs[i].triggerContractVerification) {
        addScriptHash = this.invokeArgs[i].scriptHash;
      }
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
    if (addScriptHash !== '') {
      transaction.addAttribute(
        tx.TxAttrUsage.Script,
        u.reverseHex(addScriptHash)
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

  private addInputs(
    assetid: string,
    amount: number,
    fromScript: string,
    newTx: InvocationTransaction,
    fee: number = 0
  ): Promise<InvocationTransaction> {
    return new Promise((mResolve, reject) => {
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
          mResolve(newTx);
        });
    });
  }

  public addFee(
    from: string,
    newTx: InvocationTransaction,
    fee: number = 0
  ): Promise<InvocationTransaction> {
    return new Promise((mResolve) => {
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
          // reject('no enough GAS to fee');
          // this.chrome.windowCallback({
          //     error: ERRORS.INSUFFICIENT_FUNDS,
          //     return: requestTarget.Deploy,
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
        mResolve(newTx);
      });
    });
  }

  public exit() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTarget.InvokeMulti,
        ID: this.messageID,
      },
      true
    );
  }

  public confirm() {
    if (this.broadcastOverride) {
      this.loading = false;
      this.loadingMsg = '';
      this.chrome.windowCallback(
        {
          data: {
            txid: this.tx.hash,
            signedTx: this.tx.serialize(true),
          },
          return: requestTarget.InvokeMulti,
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
        }
        this.signTx();
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
              return: requestTarget.InvokeMulti,
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
