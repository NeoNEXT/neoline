import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  RateState,
  GlobalService,
  ChromeService,
  SettingState,
  NeoAssetInfoState,
  NeoGasService,
  NeoAssetService,
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
import {
  STORAGE_NAME,
  GAS3_CONTRACT,
  ChainType,
  AddAddressBookProp,
} from '../../_lib';
import { Neo3TransferService } from '../../transfer/neo3-transfer.service';
import BigNumber from 'bignumber.js';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet3 } from '@popup/_lib';

type TabType = 'details' | 'data';

@Component({
  templateUrl: 'neo3-transfer.component.html',
  styleUrls: ['neo3-transfer.component.scss'],
})
export class PopupNoticeNeo3TransferComponent implements OnInit {
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
  private creating = false;
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
  showHardwareSign = false;
  unsignedTx;
  storageNeoXAddressBook: AddAddressBookProp[];

  private accountSub: Unsubscribable;
  public fromAddress: string;
  public n3Network: RpcNetwork;
  currentWallet: Wallet3;
  chainType: ChainType;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private aRoute: ActivatedRoute,
    private transfer: TransferService,
    private global: GlobalService,
    private chrome: ChromeService,
    private dialog: MatDialog,
    private neo3Transfer: Neo3TransferService,
    private settingState: SettingState,
    private store: Store<AppState>,
    private neoAssetInfoState: NeoAssetInfoState,
    private neoAssetService: NeoAssetService,
    private neoGasService: NeoGasService,
    private rateState: RateState
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet as Wallet3;
      this.fromAddress = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.rpcClient = new rpc.RPCClient(this.n3Network.rpcUrl);
    });
  }

  ngOnInit(): void {
    this.chrome.getStorage(STORAGE_NAME.addressBook).subscribe((res) => {
      this.storageNeoXAddressBook = res?.Neo3 || [];
    });
    this.settingState.rateCurrencySub.subscribe((res) => {
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
        this.neoGasService.getGasFee().subscribe((res: GasFeeSpeed) => {
          this.fee = res.propose_price;
        });
      }
      this.remark = params.remark || '';
      this.getAssetDetail();
    });
  }

  async getAssetDetail() {
    const symbols = await this.neoAssetInfoState.getAssetSymbols(
      [this.assetId],
      this.chainType
    );
    this.symbol = symbols[0];
    const balance = await this.neoAssetService.getAddressAssetBalance(
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
    } else {
      this.global.snackBarTip('balanceLack');
    }
  }

  public submit() {
    this.loading = true;
    this.loadingMsg = 'loading';
    this.creating = true;
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
          this.loading = false;
          this.loadingMsg = '';
          this.systemFee = tx.systemFee.toDecimal(8);
          this.networkFee = tx.networkFee.toDecimal(8);
          this.getAssetRate();
          this.canSend = true;
          this.resolveSign(tx);
        },
        (err) => {
          this.loading = false;
          this.loadingMsg = '';
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
      return;
    }
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
            txid: TxHash,
            value: -this.amount,
            block_time: Math.floor(new Date().getTime() / 1000),
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
        setData[`TxArr_${this.chainType}-${this.n3Network.id}`] =
          (await this.chrome.getLocalStorage(
            `TxArr_${this.chainType}-${this.n3Network.id}`
          )) || [];
        setData[`TxArr_${this.chainType}-${this.n3Network.id}`].push(TxHash);
        this.chrome.setLocalStorage(setData);
        this.dialog.open(PopupTransferSuccessDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
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
        this.global.snackBarTip('txFailed', err.msg || err);
      });
  }

  public pushTransaction(transaction: object) {
    const networkName = `${this.chainType}-${this.n3Network.id}`;
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
    const gasPrice = await this.rateState.getAssetRateV2('Neo3', GAS3_CONTRACT);
    if (gasPrice) {
      this.feeMoney = new BigNumber(this.fee).times(gasPrice).toFixed();
      this.systemFeeMoney = new BigNumber(this.systemFee)
        .times(gasPrice)
        .toFixed();
      this.networkFeeMoney = new BigNumber(this.networkFee)
        .times(gasPrice)
        .toFixed();
      if (this.symbol === 'GAS') {
        this.money = new BigNumber(this.amount).times(gasPrice).toFixed();
      } else {
        this.money = await this.rateState.getAssetAmountRate({
          chainType: 'Neo3',
          assetId: this.assetId,
          amount: this.amount,
        });
      }
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
        if (res || res === 0) {
          this.fee = res;
          if (res === 0 || res === '0') {
            this.feeMoney = '0';
          } else {
            this.rateState
              .getAssetAmountRate({
                chainType: 'Neo3',
                assetId: GAS3_CONTRACT,
                amount: this.fee,
              })
              .then((res) => {
                this.feeMoney = res;
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

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.tx = tx;
      this.resolveSend(tx);
    }
  }

  private getSignTx(tx: Transaction3) {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.unsignedTx = tx;
      this.showHardwareSign = true;
      return;
    }
    this.global
      .getWIF(this.neo3WIFArr, this.neo3WalletArr, this.currentWallet)
      .then((wif) => {
        tx.sign(wif, this.n3Network.magicNumber);
        this.tx = tx;
        this.resolveSend(tx);
      });
  }

  getWalletName(address: string) {
    const innerWallet = this.neo3WalletArr.find(
      (item) => item.accounts[0].address === address
    );
    const addressBook = this.storageNeoXAddressBook.find(
      (item) => item.address === address
    );
    return innerWallet?.name ?? addressBook?.name ?? '';
  }
}
