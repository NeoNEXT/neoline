import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, LedgerService, UtilServiceState } from '@/app/core';
import { ERRORS, requestTarget } from '@/models/dapi';
import { wallet, u } from '@cityofzion/neon-js';
import { randomBytes } from 'crypto';
import { RpcNetwork, LedgerStatuses, ChainType } from '../../_lib';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: './signature.component.html',
  styleUrls: ['./signature.component.scss'],
})
export class PopupNoticeSignComponent implements OnInit, OnDestroy {
  public message: string;
  private messageID = 0;

  getStatusInterval;
  loading = false;
  loadingMsg = '';

  publicKey;
  randomSalt;

  private accountSub: Unsubscribable;
  public address: string;
  public n2Network: RpcNetwork;
  private currentWallet: Wallet2 | Wallet3;
  private chainType: ChainType;
  private neo2WIFArr: string[];
  private neo2WalletArr: Wallet2[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private ledger: LedgerService,
    private utilServiceState: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.neo2WIFArr = state.neo2WIFArr;
      this.neo2WalletArr = state.neo2WalletArr;
    });
  }
  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(() => {
      const query = this.utilServiceState.parseUrl(location.hash);
      this.messageID = query.messageID;
      this.message = query.message;
      window.onbeforeunload = () => {
        this.chrome.windowCallback({
          error: ERRORS.CANCELLED,
          return: requestTarget.SignMessage,
          ID: this.messageID,
        });
      };
    });
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTarget.SignMessage,
        ID: this.messageID,
      },
      true
    );
  }

  public signature() {
    this.randomSalt = randomBytes(16).toString('hex');
    const parameterHexString = Buffer.from(
      this.randomSalt + this.message
    ).toString('hex');
    const lengthHex = (parameterHexString.length / 2)
      .toString(16)
      .padStart(2, '0');
    const concatenatedString = lengthHex + parameterHexString;
    const serializedTransaction = '010001f0' + concatenatedString + '0000';
    this.getSignTx(serializedTransaction);
  }

  private sendMessage(tx) {
    const data = {
      publicKey: this.publicKey,
      data: tx,
      salt: this.randomSalt,
      message: this.message,
    };
    this.chrome.windowCallback(
      {
        return: requestTarget.SignMessage,
        data,
        ID: this.messageID,
      },
      true
    );
  }

  private getLedgerStatus(tx) {
    this.ledger.getDeviceStatus(this.chainType).then(async (res) => {
      this.loadingMsg = LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';
        this.ledger
          .getLedgerSignedTx(
            tx,
            this.currentWallet,
            this.chainType,
            undefined,
            true
          )
          .then((tx) => {
            this.loading = false;
            this.loadingMsg = '';
            this.sendMessage(tx);
          })
          .catch((error) => {
            this.loading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }

  private getSignTx(tx) {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.publicKey = this.currentWallet.accounts[0]?.extra?.publicKey;
      this.loading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus(tx);
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus(tx);
      });
      return;
    }
    this.utilServiceState
      .getWIF(this.neo2WIFArr, this.neo2WalletArr, this.currentWallet)
      .then((wif) => {
        const privateKey = wallet.getPrivateKeyFromWIF(wif);
        this.publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
        this.sendMessage(wallet.sign(tx, privateKey));
      });
  }
}
