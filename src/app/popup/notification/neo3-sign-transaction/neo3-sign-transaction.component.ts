import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, LedgerService } from '@/app/core';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { RpcNetwork, ChainType } from '../../_lib';
import { LedgerStatuses } from '../../_lib';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: './neo3-sign-transaction.component.html',
  styleUrls: ['./neo3-sign-transaction.component.scss'],
})
export class PopupNoticeNeo3SignTransactionComponent implements OnInit {
  public tx: Transaction;
  public txJson;
  public serializeTx: string;
  private messageID = 0;
  public magicNumber;

  getStatusInterval;
  loading = false;
  loadingMsg = '';

  private accountSub: Unsubscribable;
  public address: string;
  public n3Network: RpcNetwork;
  private currentWallet: Wallet2 | Wallet3;
  private chainType: ChainType;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private ledger: LedgerService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.address = state.currentWallet.accounts[0].address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe((params: any) => {
      this.messageID = params.messageID;
      this.txJson = JSON.parse(params.transaction);
      if (params?.magicNumber) {
        this.magicNumber = Number(params?.magicNumber);
      }
      try {
        this.tx = new Transaction(this.txJson);
        this.serializeTx = this.tx.serialize(false);
      } catch (error) {
        this.chrome.windowCallback(
          {
            error: {
              ...ERRORS.MALFORMED_INPUT,
              description: error?.message || error,
            },
            return: requestTargetN3.SignTransaction,
            ID: this.messageID,
          },
          true
        );
      }
      window.onbeforeunload = () => {
        this.chrome.windowCallback({
          error: ERRORS.CANCELLED,
          return: requestTargetN3.SignTransaction,
          ID: this.messageID,
        });
      };
    });
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetN3.SignTransaction,
        ID: this.messageID,
      },
      true
    );
  }

  private sendMessage() {
    this.chrome.windowCallback(
      {
        return: requestTargetN3.SignTransaction,
        data: this.tx.export(),
        ID: this.messageID,
      },
      true
    );
  }

  private getLedgerStatus() {
    this.ledger.getDeviceStatus(this.chainType).then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msgNeo3 || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';
        this.ledger
          .getLedgerSignedTx(
            this.tx,
            this.currentWallet,
            this.chainType,
            this.n3Network.magicNumber
          )
          .then((tx) => {
            this.loading = false;
            this.loadingMsg = '';
            this.tx = tx;
            this.sendMessage();
          })
          .catch((error) => {
            this.loading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }

  public getSignTx() {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.loading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus();
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus();
      });
      return;
    }
    const wif =
      this.neo3WIFArr[
        this.neo3WalletArr.findIndex(
          (item) => item.accounts[0].address === this.address
        )
      ];
    this.tx.sign(wif, this.n3Network.magicNumber);
    this.sendMessage();
  }
}
