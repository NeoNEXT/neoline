import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ChromeService,
  GlobalService,
  LedgerService,
  UtilServiceState,
} from '@/app/core';
import { randomBytes } from 'crypto';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { RpcNetwork, ChainType, LedgerStatuses } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { interval } from 'rxjs';

@Component({
  templateUrl: './neo3-signature-v2.component.html',
  styleUrls: ['./neo3-signature-v2.component.scss'],
})
export class PopupNoticeNeo3SignV2Component implements OnInit {
  public message: string;
  private messageID = 0;
  isSign = false;
  jsonMessage;

  getStatusInterval;
  loading = false;
  loadingMsg = '';

  publicKey;
  randomSalt;

  private accountSub: Unsubscribable;
  public address: string;
  public n3Network: RpcNetwork;
  private chainType: ChainType;
  private currentWallet: Wallet3;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private global: GlobalService,
    private ledger: LedgerService,
    private utilServiceState: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet as Wallet3;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(() => {
      const query = this.utilServiceState.parseUrl(location.hash);
      this.messageID = query.messageID;
      this.message = query.message;
      if (query?.isJsonObject === 'true') {
        this.jsonMessage = JSON.parse(this.message);
      }
      this.isSign = query?.sign === '1' ? true : false;
      window.onbeforeunload = () => {
        this.chrome.windowCallback({
          error: ERRORS.CANCELLED,
          return: this.isSign
            ? requestTargetN3.SignMessageWithoutSaltV2
            : requestTargetN3.SignMessageV2,
          ID: this.messageID,
        });
      };
    });
  }

  public cancel() {
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: this.isSign
          ? requestTargetN3.SignMessageWithoutSaltV2
          : requestTargetN3.SignMessageV2,
        ID: this.messageID,
      },
      true
    );
  }

  public signature() {
    this.randomSalt = randomBytes(16).toString('hex');
    const str = this.isSign ? this.message : this.randomSalt + this.message;
    const parameterHexString = Buffer.from(str).toString('hex');
    const lengthHex = u.num2VarInt(parameterHexString.length / 2);
    const concatenatedString = lengthHex + parameterHexString;
    const serializedTransaction =
      '000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000' +
      concatenatedString;
    this.getSignTx(serializedTransaction);
  }

  private sendMessage(tx) {
    const data = {
      publicKey: this.publicKey,
      data: tx,
      salt: this.randomSalt,
      message: this.message,
    };
    if (this.isSign) {
      delete data.salt;
    }
    this.chrome.windowCallback(
      {
        return: this.isSign
          ? requestTargetN3.SignMessageWithoutSaltV2
          : requestTargetN3.SignMessageV2,
        data,
        ID: this.messageID,
      },
      true
    );
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
            0,
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
      .getWIF(this.neo3WIFArr, this.neo3WalletArr, this.currentWallet)
      .then((wif) => {
        const privateKey = wallet.getPrivateKeyFromWIF(wif);
        this.publicKey = wallet.getPublicKeyFromPrivateKey(privateKey);
        tx = u.num2hexstring(0, 4, true) + u.sha256(tx);
        this.sendMessage(wallet.sign(tx, privateKey));
      });
  }
}
