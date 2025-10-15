import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  GlobalService,
  ChromeService,
  NotificationService,
  SettingState,
  NeoGasService,
  RateState,
  NeoAssetInfoState,
} from '@/app/core';
import { Transaction, Witness } from '@cityofzion/neon-core-neo3/lib/tx';
import { tx, wallet } from '@cityofzion/neon-js-neo3';
import { MatDialog } from '@angular/material/dialog';
import { ERRORS } from '@/models/dapi';
import { requestTargetN3 } from '@/models/dapi_neo3';
import {
  PopupDapiPromptComponent,
  PopupEditFeeDialogComponent,
  PopupTransferSuccessDialogComponent,
} from '../../_dialogs';
import { bignumber } from 'mathjs';
import {
  STORAGE_NAME,
  GAS3_CONTRACT,
  ChainType,
  Neo3InvokeParams,
  RpcNetwork,
  Wallet3,
} from '@/app/popup/_lib';
import { Neo3InvokeService } from '../../transfer/neo3-invoke.service';
import BigNumber from 'bignumber.js';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';

type TabType = 'details' | 'data';

@Component({
  templateUrl: 'neo3-invoke.component.html',
  styleUrls: ['neo3-invoke.component.scss'],
})
export class PopupNoticeNeo3InvokeComponent implements OnInit {
  tabType: TabType = 'details';
  invokeParams: Neo3InvokeParams;

  rateCurrency = '';
  txSerialize = '';

  tx: Transaction;
  loading = false;
  loadingMsg: string;
  private messageID = 0;
  private invokeArgsArray: any[] = [];

  fee = null;
  systemFee;
  networkFee;
  totalFee;
  totalMoney;

  canSend = false;
  showHardwareSign = false;
  expandTotalFee = false;

  private accountSub: Unsubscribable;
  signAddress: string;
  n3Network: RpcNetwork;
  currentWallet: Wallet3;
  private chainType: ChainType;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private aRoute: ActivatedRoute,
    private global: GlobalService,
    private dialog: MatDialog,
    private chrome: ChromeService,
    private settingState: SettingState,
    private neo3Invoke: Neo3InvokeService,
    private notification: NotificationService,
    private store: Store<AppState>,
    private rateState: RateState,
    private neoAssetInfoState: NeoAssetInfoState,
    private neoGasService: NeoGasService
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet as Wallet3;
      this.signAddress = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit(): void {
    this.settingState.rateCurrencySub.subscribe((res) => {
      this.rateCurrency = res;
    });
    this.aRoute.queryParams.subscribe(async ({ messageID }) => {
      this.messageID = messageID;
      this.chrome
        .getStorage(STORAGE_NAME.InvokeArgsArray)
        .subscribe(async (invokeArgsArray) => {
          this.invokeArgsArray = invokeArgsArray;
          this.invokeParams = invokeArgsArray[messageID];
          if (!this.invokeParams) {
            return;
          }
          this.getContractManifest();
          this.invokeParams.minReqFee = this.invokeParams.minReqFee || '0';

          if (this.invokeParams.fee) {
            this.fee = bignumber(this.invokeParams.fee).toFixed();
          } else {
            this.fee = '0';
            const res_1 = await this.neoGasService.getGasFee().toPromise();
            this.fee = bignumber(this.invokeParams.minReqFee)
              .add(bignumber(res_1.propose_price))
              .toFixed();
          }
          this.prompt();
          this.signTx();
        });
    });
    window.onbeforeunload = () => {
      if (this.chrome.check) {
        delete this.invokeArgsArray[this.messageID];
        this.chrome.setStorage(
          STORAGE_NAME.InvokeArgsArray,
          this.invokeArgsArray
        );
      }
      this.chrome.windowCallback({
        error: ERRORS.CANCELLED,
        return: requestTargetN3.Invoke,
        ID: this.messageID,
      });
    };
  }

  private getAssetRate() {
    this.totalFee = new BigNumber(this.systemFee)
      .plus(new BigNumber(this.networkFee))
      .toFixed();
    this.rateState
      .getAssetAmountRate({
        chainType: 'Neo3',
        assetId: GAS3_CONTRACT,
        amount: this.totalFee,
      })
      .then((res) => {
        this.totalMoney = res;
      });
  }

  private async resolveSend() {
    if (this.invokeParams.broadcastOverride) {
      this.loading = false;
      this.loadingMsg = '';
      this.chrome.windowCallback(
        {
          data: {
            txid: this.tx.hash(),
            signedTx: this.tx.serialize(true),
          },
          return: requestTargetN3.Invoke,
          ID: this.messageID,
        },
        true
      );
      return;
    }
    this.loading = true;
    this.loadingMsg = 'Wait';
    return this.neo3Invoke
      .sendNeo3Tx(this.neo3Invoke.hexToBase64(this.tx.serialize(true)))
      .then(async (txHash) => {
        if (!txHash || !txHash.startsWith('0x')) {
          throw {
            msg: 'Transaction rejected by RPC node.',
          };
        }
        this.loading = false;
        this.loadingMsg = '';
        this.chrome.windowCallback({
          data: {
            txid: txHash,
            nodeUrl: `${this.n3Network.rpcUrl}`,
          },
          return: requestTargetN3.Invoke,
          ID: this.messageID,
        });
        const setData = {};
        setData[`TxArr_${this.chainType}-${this.n3Network.id}`] =
          (await this.chrome.getLocalStorage(
            `TxArr_${this.chainType}-${this.n3Network.id}`
          )) || [];
        setData[`TxArr_${this.chainType}-${this.n3Network.id}`].push(txHash);
        this.chrome.setLocalStorage(setData);
        this.dialog.open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
        });
      })
      .catch((err) => {
        this.loading = false;
        this.loadingMsg = '';
        this.chrome.windowCallback({
          error: { ...ERRORS.RPC_ERROR, description: err?.error },
          return: requestTargetN3.Invoke,
          ID: this.messageID,
        });
        this.global.snackBarTip('txFailed', err.msg || err);
      });
  }

  confirm() {
    if (!this.tx) {
      this.signTx();
      return;
    }
    this.getSignTx();
    delete this.invokeArgsArray[this.messageID];
    this.chrome.setStorage(STORAGE_NAME.InvokeArgsArray, this.invokeArgsArray);
  }

  editFee() {
    this.dialog
      .open(PopupEditFeeDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          fee: this.fee,
          minFee: this.invokeParams.minReqFee,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res || res === 0) {
          this.fee = res;
          if (res < this.invokeParams.minReqFee) {
            this.fee = this.invokeParams.minReqFee;
          }
          this.signTx();
        }
      });
  }

  exit() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetN3.Invoke,
        ID: this.messageID,
      },
      true
    );
  }

  private signTx() {
    setTimeout(() => {
      this.loading = true;
      this.neo3Invoke
        .createNeo3Tx({
          invokeArgs: [
            {
              scriptHash: this.invokeParams.scriptHash,
              operation: this.invokeParams.operation,
              args: this.neo3Invoke.handleInvokeArgs(this.invokeParams.args),
            },
          ],
          signers: this.invokeParams.signers,
          networkFee: this.fee,
          systemFee: this.invokeParams.extraSystemFee,
          overrideSystemFee: this.invokeParams.overrideSystemFee,
        })
        .subscribe(
          async (unSignTx: Transaction) => {
            this.systemFee = unSignTx.systemFee.toDecimal(8);
            this.networkFee = unSignTx.networkFee.toDecimal(8);
            this.getAssetRate();
            this.tx = unSignTx;
            this.txSerialize = this.tx.serialize(false);
            let checkAddress = this.signAddress;
            if (this.invokeParams.signers.length > 1) {
              const scriptHash = this.invokeParams.signers[0].account
                .toString()
                .startsWith('0x')
                ? this.invokeParams.signers[0].account.toString().substr(2)
                : this.invokeParams.signers[0].account.toString();
              checkAddress = wallet.getAddressFromScriptHash(scriptHash);
            }
            const isEnoughFee = await this.neo3Invoke.isEnoughFee(
              checkAddress,
              this.systemFee,
              this.networkFee
            );
            this.loading = false;
            if (isEnoughFee) {
              this.canSend = true;
            } else {
              this.canSend = false;
              this.global.snackBarTip('InsufficientGas');
            }
          },
          (error) => {
            console.log(error);
            let description;
            if (error?.type === 'scriptError') {
              description = this.notification.content.checkInput;
              this.global.snackBarTip('checkInput');
            } else {
              description =
                error?.error?.message ||
                error?.error?.exception ||
                this.notification.content.rpcError;
              this.global.snackBarTip(
                error?.error?.message || error?.error?.exception || 'rpcError'
              );
            }
            this.loading = false;
            this.chrome.windowCallback({
              error: {
                type: 'RPC_ERROR',
                description,
              },
              return: requestTargetN3.Invoke,
              ID: this.messageID,
            });
          }
        );
    }, 0);
  }

  private prompt() {
    if (this.invokeParams.signers[0].scopes === tx.WitnessScope.Global) {
      this.dialog
        .open(PopupDapiPromptComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
          data: {
            scopes: this.invokeParams.signers[0].scopes,
          },
        })
        .afterClosed()
        .subscribe(() => {});
    }
  }

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.tx = tx;
      if (this.invokeParams.signers.length > 1) {
        const addressSign = this.tx.witnesses[0];
        const addressIndex = this.tx.signers.findIndex((item) =>
          item.account
            .toString()
            .includes(wallet.getScriptHashFromAddress(this.signAddress))
        );
        this.tx.witnesses = new Array(this.tx.signers.length).fill(
          new Witness({ verificationScript: '', invocationScript: '' })
        );
        this.tx.witnesses[addressIndex] = addressSign;
      }
      this.resolveSend();
    }
  }

  private async getSignTx() {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.showHardwareSign = true;
      return;
    }
    const wif = await this.global.getWIF(
      this.neo3WIFArr,
      this.neo3WalletArr,
      this.currentWallet
    );
    this.tx.sign(wif, this.n3Network.magicNumber);
    if (this.invokeParams.signers.length > 1) {
      const addressSign = this.tx.witnesses[0];
      const addressIndex = this.invokeParams.signers.findIndex((item) =>
        item.account
          .toString()
          .includes(wallet.getScriptHashFromAddress(this.signAddress))
      );
      this.tx.witnesses = new Array(this.invokeParams.signers.length).fill(
        new Witness({ verificationScript: '', invocationScript: '' })
      );
      this.tx.witnesses[addressIndex] = addressSign;
    }
    this.resolveSend();
  }

  private getContractManifest() {
    this.neoAssetInfoState
      .getContractManifests([this.invokeParams.scriptHash])
      .subscribe(([res]) => {
        this.invokeParams.contractName = res.name;
        const method = res.abi.methods.find(
          (item) => item.name === this.invokeParams.operation
        );
        if (method) {
          this.invokeParams.args.forEach((item, index) => {
            item.name = method.parameters[index].name;
          });
        }
      });
  }
}
